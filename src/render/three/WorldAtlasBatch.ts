import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  DynamicDrawUsage,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  LinearSRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";
import type { Camera, Texture } from "three";

export interface WorldAtlasDefinition {
  readonly url: string;
  readonly columns: number;
  readonly rows: number;
  readonly frames: number;
  readonly fps: number;
  readonly anchorY: number;
  readonly additive?: boolean;
}
export const WORLD_ATLAS_CAPACITY_LIMIT = 4096;

const VERTEX = /* glsl */ `
attribute vec3 particleCentre;
attribute vec4 particleShape;
attribute vec4 particleTint;
attribute vec4 particleUv;
attribute float particleRotation;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
varying vec2 vUv;
varying vec4 vTint;
varying float vNearFade;
float atlasVisibility(float gap, float size, float span) {
  return smoothstep(0.0, max(size * 0.5, 0.001), gap)
    * (1.0 - smoothstep(1.2, 3.0, span));
}
vec2 atlasTurn(float x, float y, float angle) {
  return vec2(cos(angle) * x - sin(angle) * y, sin(angle) * x + cos(angle) * y);
}
void main() {
  // Centres and sizes are already in world units, independent of the batch's parent transform.
  vec2 corner = atlasTurn(position.x * particleShape.x,
    (position.y + particleShape.w) * particleShape.y, particleRotation);
  vec3 world = particleCentre + cameraRight * corner.x + cameraUp * corner.y;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vec4 clip = projectionMatrix * view;
  vUv = particleUv.xy + uv * particleUv.zw;
  vTint = particleTint;
  vNearFade = 0.0;
  if (clip.w <= 0.0 || clip.z + clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 1.0, 1.0);
    return;
  }
  // z+w vanishes on the near plane for both perspective and orthographic cameras.
  float depthScale = abs(projectionMatrix[2][2] + projectionMatrix[2][3]);
  float gap = (clip.z + clip.w) / max(depthScale, 0.000001);
  float c = abs(cos(particleRotation)), s = abs(sin(particleRotation));
  vec2 extent = vec2(c * particleShape.x + s * particleShape.y,
    s * particleShape.x + c * particleShape.y);
  vec4 rightClip = projectionMatrix * viewMatrix * vec4(cameraRight * extent.x, 0.0);
  vec4 upClip = projectionMatrix * viewMatrix * vec4(cameraUp * extent.y, 0.0);
  float span = max(length(rightClip.xy), length(upClip.xy)) / clip.w;
  vNearFade = atlasVisibility(gap, max(particleShape.x, particleShape.y), span);
  gl_Position = clip;
}
`;
const FRAGMENT = /* glsl */ `
uniform sampler2D atlas;
varying vec2 vUv;
varying vec4 vTint;
varying float vNearFade;
void main() {
  vec4 source = texture2D(atlas, vUv);
  float alpha = source.a * vTint.a * vNearFade;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(source.rgb * vTint.rgb, alpha);
  #include <colorspace_fragment>
}
`;

function validDefinition(definition: WorldAtlasDefinition, capacity: number): boolean {
  return (
    Number.isInteger(capacity) &&
    capacity > 0 &&
    capacity <= WORLD_ATLAS_CAPACITY_LIMIT &&
    [definition.columns, definition.rows, definition.frames].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) &&
    Number.isSafeInteger(definition.columns * definition.rows) &&
    definition.frames <= definition.columns * definition.rows &&
    Number.isFinite(definition.fps) &&
    definition.fps > 0 &&
    Number.isFinite(definition.anchorY) &&
    definition.anchorY >= 0 &&
    definition.anchorY <= 1 &&
    definition.url.trim().length > 0
  );
}

/** World-space billboards with one draw per atlas. The batch exclusively owns its GPU resources. */
export class WorldAtlasBatch {
  readonly group = new Group();
  private readonly geometry: PlaneGeometry;
  private readonly centres: InstancedBufferAttribute;
  private readonly shapes: InstancedBufferAttribute;
  private readonly tints: InstancedBufferAttribute;
  private readonly uvs: InstancedBufferAttribute;
  private readonly rotations: InstancedBufferAttribute;
  private readonly attributes: readonly InstancedBufferAttribute[];
  private readonly billboardFrame = new Matrix4();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly material: ShaderMaterial;
  private readonly mesh: InstancedMesh;
  private texture: Texture | undefined;
  private imageWidth = 1;
  private imageHeight = 1;
  private disposed = false;
  ready = false;
  private used = 0;

  constructor(
    readonly definition: WorldAtlasDefinition,
    readonly capacity: number
  ) {
    if (!validDefinition(definition, capacity))
      throw new RangeError("Invalid world atlas definition or capacity");
    this.definition = Object.freeze({ ...definition });
    this.geometry = new PlaneGeometry(1, 1);
    this.centres = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.shapes = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.tints = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.uvs = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.rotations = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.attributes = [this.centres, this.shapes, this.tints, this.uvs, this.rotations];
    for (const attribute of this.attributes) attribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("particleCentre", this.centres);
    this.geometry.setAttribute("particleShape", this.shapes);
    this.geometry.setAttribute("particleTint", this.tints);
    this.geometry.setAttribute("particleUv", this.uvs);
    this.geometry.setAttribute("particleRotation", this.rotations);
    this.material = new ShaderMaterial({
      uniforms: {
        atlas: { value: null },
        cameraRight: { value: this.right },
        cameraUp: { value: this.up }
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
      blending: definition.additive === false ? NormalBlending : AdditiveBlending
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.visible = false;
    this.group.add(this.mesh);
    void this.load();
  }

  private async load(): Promise<void> {
    let loaded: Texture | undefined;
    try {
      loaded = await new TextureLoader().loadAsync(this.definition.url);
      if (this.disposed) {
        loaded.dispose();
        return;
      }
      const image = loaded.image as { width?: unknown; height?: unknown } | undefined;
      const width = image?.width,
        height = image?.height;
      if (
        typeof width !== "number" ||
        typeof height !== "number" ||
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < this.definition.columns ||
        height < this.definition.rows ||
        width % this.definition.columns !== 0 ||
        height % this.definition.rows !== 0
      )
        throw new Error("World atlas image does not match its cell grid");
      this.imageWidth = width;
      this.imageHeight = height;
      // The shared stage stores display RGB directly and has a linear output target.
      loaded.colorSpace = LinearSRGBColorSpace;
      loaded.flipY = true;
      // Mip levels would mix neighboring animation cells; half-texel UVs handle linear filtering.
      loaded.generateMipmaps = false;
      loaded.minFilter = loaded.magFilter = LinearFilter;
      loaded.wrapS = loaded.wrapT = ClampToEdgeWrapping;
      loaded.needsUpdate = true;
      this.texture = loaded;
      const atlas = this.material.uniforms.atlas;
      if (atlas) atlas.value = loaded;
      this.ready = true;
    } catch (error) {
      loaded?.dispose();
      if (!this.disposed)
        console.warn("Native performance atlas unavailable; keep legacy effects", error);
    }
  }

  begin(camera: Camera): void {
    if (this.disposed) return;
    this.used = 0;
    this.mesh.count = 0;
    camera.updateWorldMatrix(true, false);
    // Three strips inherited scale from the view matrix; use its actual inverse basis.
    this.billboardFrame.copy(camera.matrixWorldInverse).invert();
    this.right.setFromMatrixColumn(this.billboardFrame, 0).normalize();
    this.up.setFromMatrixColumn(this.billboardFrame, 1);
    this.up.addScaledVector(this.right, -this.up.dot(this.right)).normalize();
  }

  /** Tint, alpha, frame order matches existing stage callers. No particle advances song time. */
  add(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    tint: number,
    alpha: number,
    frame: number,
    gain = 1,
    rotation = 0
  ): void {
    if (
      this.disposed ||
      this.used >= this.capacity ||
      !this.ready ||
      !Number.isFinite(Math.fround(x)) ||
      !Number.isFinite(Math.fround(y)) ||
      !Number.isFinite(Math.fround(z)) ||
      !Number.isFinite(Math.fround(width)) ||
      !Number.isFinite(Math.fround(height)) ||
      !Number.isFinite(Math.fround(rotation)) ||
      !Number.isFinite(tint) ||
      !Number.isFinite(alpha) ||
      !Number.isFinite(frame) ||
      !Number.isFinite(gain) ||
      gain <= 0 ||
      Math.fround(width) <= 0 ||
      Math.fround(height) <= 0 ||
      alpha <= 0
    )
      return;
    const { columns, rows, frames, anchorY } = this.definition;
    const index = ((Math.floor(frame) % frames) + frames) % frames;
    this.centres.setXYZ(this.used, x, y, z);
    this.rotations.setX(this.used, rotation);
    this.shapes.setXYZW(this.used, width, height, index, anchorY - 0.5);
    const rgb = Math.max(0, Math.min(0xffffff, Math.floor(tint)));
    this.tints.setXYZW(
      this.used,
      (((rgb >> 16) & 255) / 255) * gain,
      (((rgb >> 8) & 255) / 255) * gain,
      ((rgb & 255) / 255) * gain,
      Math.min(1, alpha)
    );
    this.uvs.setXYZW(
      this.used,
      (index % columns) / columns + 0.5 / this.imageWidth,
      1 - (Math.floor(index / columns) + 1) / rows + 0.5 / this.imageHeight,
      1 / columns - 1 / this.imageWidth,
      1 / rows - 1 / this.imageHeight
    );
    this.used++;
  }

  end(): void {
    if (this.disposed) return;
    this.mesh.count = this.ready ? this.used : 0;
    this.group.visible = this.mesh.count > 0;
    if (!this.used) return;
    for (const attribute of this.attributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.used * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.used = this.mesh.count = 0;
    this.group.visible = false;
    this.group.removeFromParent();
    this.group.clear();
    this.mesh.dispose();
    this.geometry.dispose();
    const atlas = this.material.uniforms.atlas;
    if (atlas) atlas.value = null;
    this.material.dispose();
    this.texture?.dispose();
    this.texture = undefined;
  }
}
