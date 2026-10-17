import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial
} from "three";
import type { WorldRoadNote } from "./roadNoteGeometry";
import {
  createNoteSlabGeometry,
  NOTE_SLAB_ATTRIBUTES,
  NOTE_SLAB_THICKNESS,
  NOTE_SLAB_VERTEX
} from "./noteSlabGeometry";

export const NOTE_AURA_CAPACITY = 192;
export const NOTE_AURA_LAYERS = 2;
export const NOTE_AURA_MIN_DURATION = 0.6;
const INSTANCE_CAPACITY = NOTE_AURA_CAPACITY * NOTE_AURA_LAYERS;

function variation(seed: number, channel: number): number {
  const value = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const NOISE = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash3(cell), hash3(cell + vec3(1,0,0)), f.x);
  float b = mix(hash3(cell + vec3(0,1,0)), hash3(cell + vec3(1,1,0)), f.x);
  float c = mix(hash3(cell + vec3(0,0,1)), hash3(cell + vec3(1,0,1)), f.x);
  float d = mix(hash3(cell + vec3(0,1,1)), hash3(cell + vec3(1,1,1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
`;

const VERTEX = /* glsl */ `
attribute vec3 noteSize;
attribute float noteAlpha;
attribute vec4 noteParams;
attribute float noteLayer;
attribute float noteOffset;
${NOTE_SLAB_ATTRIBUTES}
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vTint;
varying vec4 vParams;
varying float vAlpha;
varying float vLayer;
varying float vOffset;
void main() {
  ${NOTE_SLAB_VERTEX}
  vec3 base = slabPoint;
  // Constant inflation prevents endpoint interpolation from changing when the note is clipped.
  float inflate = noteSize.x * (0.075 + noteLayer * 0.035) * noteParams.w;
  float sideInflate = noteSize.x * (0.03 + noteLayer * 0.018) * noteParams.w;
  // Keep the top band above the glass face while tightening side and end overflow.
  vec3 point = base + vec3(slabArc.x * sideInflate, slabProfile.x * 2.0 * inflate, slabArc.y * sideInflate);
  // Static shell coordinates retain affine world anchoring as either end is clipped.
  vLocal = point;
  vSize = noteSize;
  vTint = instanceColor;
  vParams = noteParams;
  vAlpha = noteAlpha;
  vLayer = noteLayer;
  vOffset = noteOffset;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(point, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float visualTime;
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vTint;
varying vec4 vParams;
varying float vAlpha;
varying float vLayer;
varying float vOffset;
${NOISE}
void main() {
  vec3 local = vec3(vLocal.xy, vLocal.z + vSize.z * 0.5 + vOffset) / vSize.x;
  // The longitudinal coordinate is domain.y; time evolves only the third noise dimension.
  float boilTime = visualTime * (0.75 + abs(vParams.y) * 0.8);
  vec3 domain = vec3(local.x * 1.6, local.z * 0.85,
                     vParams.x + local.y * 1.1 + vLayer * 2.17);
  domain *= 0.8 + vParams.z * 0.1;
  vec3 flow = vec3(0.0, 0.0, boilTime);
  float warp = noise3(domain * 0.65 + flow * 0.35);
  vec3 warped = domain + vec3((warp - 0.5) * 1.8, 0.0, 0.0) + flow;
  float molten = noise3(warped * vec3(1.0, 0.75, 1.0));
  float fine = noise3(warped * 2.4 + vec3(7.4, 3.1, 1.7));
  float density = smoothstep(0.55, 0.78, molten * 0.72 + fine * 0.28);
  // Transparent gaps separate the connected tongues; there is no uniform fog baseline.
  float alpha = density * (0.04 + density * 0.34) * vAlpha;
  alpha *= 1.0 - vLayer * 0.70;
  if (alpha < 0.003) discard;
  float heat = smoothstep(0.48, 0.78, molten) * (0.45 + fine * 0.55);
  vec3 moltenTint = mix(vTint, vec3(1.0), heat * 0.22);
  gl_FragColor = vec4(moltenTint * (0.86 + heat * 0.45), alpha);
}
`;

/** Two noisy exterior shells share one draw call; the note body occludes their far sides. */
export class ThreeNoteAura {
  readonly group = new Group();
  private readonly geometry = createNoteSlabGeometry();
  private readonly time = { value: 0 };
  private readonly material = new ShaderMaterial({
    uniforms: { visualTime: this.time },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide
  });
  private readonly sizes = new InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY * 3), 3);
  private readonly alphas = new InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY), 1);
  private readonly params = new InstancedBufferAttribute(
    new Float32Array(INSTANCE_CAPACITY * 4),
    4
  );
  private readonly layers = new InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY), 1);
  private readonly offsets = new InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY), 1);
  private readonly mesh = new InstancedMesh(this.geometry, this.material, INSTANCE_CAPACITY);
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private disposed = false;

  constructor() {
    this.geometry.setAttribute("noteSize", this.sizes);
    this.geometry.setAttribute("noteAlpha", this.alphas);
    this.geometry.setAttribute("noteParams", this.params);
    this.geometry.setAttribute("noteLayer", this.layers);
    this.geometry.setAttribute("noteOffset", this.offsets);
    this.mesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(INSTANCE_CAPACITY * 3),
      3
    );
    for (let index = 0; index < INSTANCE_CAPACITY; index++)
      this.layers.setX(index, index % NOTE_AURA_LAYERS);
    for (const attribute of [
      this.sizes,
      this.alphas,
      this.params,
      this.offsets,
      this.mesh.instanceMatrix,
      this.mesh.instanceColor
    ])
      attribute.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    this.clear();
  }

  update(
    notes: readonly WorldRoadNote[],
    floorY: number,
    visualTime = 0,
    noteCount = notes.length
  ): void {
    if (this.disposed) return;
    if (!Number.isFinite(floorY)) {
      this.clear();
      return;
    }
    const count = Number.isFinite(noteCount)
      ? Math.max(0, Math.min(notes.length, Math.floor(noteCount)))
      : notes.length;
    let used = 0;
    for (let index = 0; index < count && used < INSTANCE_CAPACITY; index++) {
      const note = notes[index];
      if (
        !note ||
        !Number.isFinite(note.x) ||
        !Number.isFinite(note.top) ||
        !Number.isFinite(note.bottom) ||
        !Number.isFinite(note.width) ||
        !Number.isFinite(note.color) ||
        !Number.isFinite(note.alpha) ||
        note.top <= note.bottom ||
        note.width <= 0 ||
        note.alpha <= 0
      )
        continue;
      const depth = note.top - note.bottom;
      const eligible =
        note.duration === undefined
          ? depth / note.width > 3
          : Number.isFinite(note.duration) && note.duration >= NOTE_AURA_MIN_DURATION;
      if (!eligible) continue;
      const height = note.width * NOTE_SLAB_THICKNESS;
      const centreY = floorY + height / 2;
      const centreZ = -(note.bottom + depth / 2);
      if (!Number.isFinite(depth) || !Number.isFinite(centreY) || !Number.isFinite(centreZ))
        continue;
      const seed = Number.isFinite(note.seed)
        ? Math.max(0, Math.min(1, note.seed ?? 0))
        : variation(note.x, 0);
      const phase = variation(seed, 1) * 37;
      const speed = (0.12 + variation(seed, 2) * 0.13) * (variation(seed, 3) < 0.5 ? -1 : 1);
      const frequency = 1.2 + variation(seed, 4) * 1.4;
      const spread = 0.8 + variation(seed, 5) * 0.5;
      const alpha = Math.min(1, note.alpha) * (0.75 + variation(seed, 6) * 0.25);
      const offset = Number.isFinite(note.textureOffset) ? (note.textureOffset ?? 0) : 0;
      this.color.setRGB(
        ((note.color >> 16) & 255) / 255,
        ((note.color >> 8) & 255) / 255,
        (note.color & 255) / 255
      );
      this.matrix.makeTranslation(note.x, centreY, centreZ);
      for (let layer = 0; layer < NOTE_AURA_LAYERS; layer++, used++) {
        this.sizes.setXYZ(used, note.width, height, depth);
        this.params.setXYZW(used, phase, speed, frequency, spread);
        this.alphas.setX(used, alpha);
        this.offsets.setX(used, offset);
        this.mesh.setColorAt(used, this.color);
        this.mesh.setMatrixAt(used, this.matrix);
      }
    }
    this.mesh.count = used;
    this.group.visible = used > 0;
    this.time.value = Number.isFinite(visualTime) ? visualTime : 0;
    if (used > 0) {
      this.upload(this.sizes, used);
      this.upload(this.alphas, used);
      this.upload(this.params, used);
      this.upload(this.offsets, used);
      this.upload(this.mesh.instanceMatrix, used);
      if (this.mesh.instanceColor) this.upload(this.mesh.instanceColor, used);
    }
  }

  clear(): void {
    this.mesh.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
    this.group.clear();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private upload(attribute: InstancedBufferAttribute, used: number): void {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, used * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}
