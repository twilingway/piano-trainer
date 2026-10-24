import {
  AdditiveBlending,
  AddEquation,
  CustomBlending,
  OneFactor,
  OneMinusSrcColorFactor,
  OneMinusSrcAlphaFactor,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix3,
  LinearSRGBColorSpace,
  Mesh as NativeMesh,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector4
} from "three";
import { Point, Rectangle } from "./math";
import { Container, type DestroyOptions } from "./scene";
import { Texture } from "./textures";

export class MeshGeometry {
  readonly native = new BufferGeometry();
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly weights: Float32Array;
  private readonly nativePositions: Float32Array;
  destroyed = false;
  constructor(options: {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array | Uint16Array | number[];
  }) {
    this.positions = options.positions;
    this.uvs = options.uvs;
    this.weights = new Float32Array(this.positions.length / 2).fill(1);
    this.nativePositions = new Float32Array((this.positions.length / 2) * 3);
    for (let i = 0; i < this.positions.length / 2; i++) {
      this.nativePositions[i * 3] = this.positions[i * 2] ?? 0;
      this.nativePositions[i * 3 + 1] = this.positions[i * 2 + 1] ?? 0;
    }
    this.native.setAttribute("position", new BufferAttribute(this.nativePositions, 3));
    this.native.setAttribute("uv", new BufferAttribute(this.uvs, 2));
    this.native.setAttribute("weight", new BufferAttribute(this.weights, 1));
    this.native.setIndex(Array.from(options.indices));
  }
  getBuffer(name: string): { data: Float32Array; update(): void } {
    const key = name === "aPosition" ? "position" : name === "aUV" ? "uv" : "weight";
    const attribute = this.native.getAttribute(key);
    return {
      data: key === "position" ? this.positions : (attribute.array as Float32Array),
      update: () => {
        if (key === "position")
          for (let i = 0; i < this.positions.length / 2; i++) {
            this.nativePositions[i * 3] = this.positions[i * 2] ?? 0;
            this.nativePositions[i * 3 + 1] = this.positions[i * 2 + 1] ?? 0;
          }
        attribute.needsUpdate = true;
        this.native.boundingSphere = null;
      }
    };
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.native.dispose();
  }
}
const vertexShader = `
attribute float weight;
varying vec3 uvq;
varying vec2 worldPoint;
void main(){
 vec4 world=modelMatrix*vec4(position.xy,0.,1.);
 worldPoint=world.xy;
 uvq=vec3(uv*weight,weight);
 gl_Position=projectionMatrix*viewMatrix*world;
}`;
const fragmentShader = `
uniform sampler2D picture;
uniform bool premultipliedPicture;
uniform bool screenBlend;
uniform vec4 frame;
uniform vec3 tint;
uniform float opacity;
uniform bool tiled;
uniform vec2 tileFactor;
uniform vec2 tileOffset;
uniform bool hasMask;
uniform sampler2D maskPicture;
uniform mat3 maskInverse;
uniform vec4 maskFrame;
uniform vec2 maskSize;
varying vec3 uvq;
varying vec2 worldPoint;
void main(){
 vec2 uv=uvq.xy/uvq.z;
 if(tiled) uv=fract(uv*tileFactor-tileOffset);
 vec4 color=texture2D(picture, frame.xy+uv*frame.zw);
 if(premultipliedPicture&&color.a>0.)color.rgb/=color.a;
 float maskAlpha=1.;
 if(hasMask){
   vec2 m=(maskInverse*vec3(worldPoint,1.)).xy/maskSize;
   if(any(lessThan(m,vec2(0.)))||any(greaterThan(m,vec2(1.)))) maskAlpha=0.;
   else {vec4 sampleMask=texture2D(maskPicture,maskFrame.xy+m*maskFrame.zw);maskAlpha=sampleMask.r*sampleMask.a;}
 }
 vec4 outputColor=vec4(color.rgb*tint,color.a*opacity*maskAlpha);
 if(screenBlend)outputColor.rgb*=outputColor.a;
 gl_FragColor=outputColor;
}`;
export class Mesh extends Container {
  readonly uniforms = {
    picture: { value: Texture.WHITE.nativeTexture },
    premultipliedPicture: { value: false },
    screenBlend: { value: false },
    frame: { value: new Vector4(0, 0, 1, 1) },
    tint: { value: new Color() },
    opacity: { value: 1 },
    tiled: { value: false },
    tileFactor: { value: new Vector2(1, 1) },
    tileOffset: { value: new Vector2() },
    hasMask: { value: false },
    maskPicture: { value: Texture.WHITE.nativeTexture },
    maskInverse: { value: new Matrix3() },
    maskFrame: { value: new Vector4(0, 0, 1, 1) },
    maskSize: { value: new Vector2(1, 1) }
  };
  readonly material: ShaderMaterial;
  readonly mesh: NativeMesh;
  tint = 0xffffff;
  texture: Texture;
  constructor(options: { geometry: MeshGeometry; texture: Texture }) {
    super();
    this.geometry = options.geometry;
    this.texture = options.texture;
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      uniforms: this.uniforms
    });
    this.mesh = new NativeMesh(this.geometry.native, this.material);
    this.mesh.frustumCulled = false;
    this.native.add(this.mesh);
  }
  readonly geometry: MeshGeometry;
  syncMaterial(alpha: number, order: number, mask?: Sprite): void {
    this.uniforms.picture.value = this.texture.nativeTexture;
    this.uniforms.premultipliedPicture.value = this.texture.nativeTexture.isRenderTargetTexture;
    const frame = this.texture.frame,
      source = this.texture.source;
    this.uniforms.frame.value.set(
      frame.x / source.width,
      frame.y / source.height,
      frame.width / source.width,
      frame.height / source.height
    );
    this.uniforms.tint.value.setHex(this.tint, LinearSRGBColorSpace);
    this.uniforms.opacity.value = alpha;
    this.uniforms.screenBlend.value = this.blendMode === "screen";
    if (this.blendMode === "screen") {
      this.material.blending = CustomBlending;
      this.material.blendEquation = AddEquation;
      this.material.blendSrc = OneFactor;
      this.material.blendDst = OneMinusSrcColorFactor;
      this.material.blendEquationAlpha = AddEquation;
      this.material.blendSrcAlpha = OneFactor;
      this.material.blendDstAlpha = OneMinusSrcAlphaFactor;
    } else this.material.blending = this.blendMode === "add" ? AdditiveBlending : NormalBlending;
    this.uniforms.hasMask.value = !!mask;
    if (mask) {
      const m = mask.worldMatrix();
      const inverse = new Matrix3().set(m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1).invert();
      const b = mask.getLocalBounds();
      inverse.premultiply(new Matrix3().set(1, 0, -b.x, 0, 1, -b.y, 0, 0, 1));
      this.uniforms.maskInverse.value.copy(inverse);
      this.uniforms.maskPicture.value = mask.texture.nativeTexture;
      const f = mask.texture.frame,
        s = mask.texture.source;
      this.uniforms.maskFrame.value.set(
        f.x / s.width,
        f.y / s.height,
        f.width / s.width,
        f.height / s.height
      );
      this.uniforms.maskSize.value.set(b.width, b.height);
    }
    this.mesh.renderOrder = order;
    this.mesh.visible = this.renderable;
  }
  override getLocalBounds(): Rectangle {
    const values = this.geometry.positions;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (let i = 0; i < values.length; i += 2) {
      left = Math.min(left, values[i] ?? 0);
      right = Math.max(right, values[i] ?? 0);
      top = Math.min(top, values[i + 1] ?? 0);
      bottom = Math.max(bottom, values[i + 1] ?? 0);
    }
    return Number.isFinite(left)
      ? new Rectangle(left, top, right - left, bottom - top)
      : new Rectangle();
  }
  override destroy(options: DestroyOptions | boolean = {}): void {
    if (this.destroyed) return;
    this.material.dispose();
    if (typeof options === "object" && options.texture) this.texture.destroy(options.textureSource);
    super.destroy(options);
  }
}
function grid(columns: number, rows: number): MeshGeometry {
  const positions = new Float32Array(columns * rows * 2),
    uvs = new Float32Array(positions.length),
    indices: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 2;
      positions[i] = uvs[i] = x / (columns - 1);
      positions[i + 1] = uvs[i + 1] = y / (rows - 1);
      if (x < columns - 1 && y < rows - 1) {
        const a = y * columns + x;
        indices.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns);
      }
    }
  return new MeshGeometry({ positions, uvs, indices });
}
export class Sprite extends Mesh {
  readonly anchor = new Point();
  readonly offset = new Point();
  protected sizeWidth: number | undefined;
  protected sizeHeight: number | undefined;
  constructor(texture: Texture | { texture?: Texture } = Texture.EMPTY) {
    super({
      geometry: grid(2, 2),
      texture: texture instanceof Texture ? texture : (texture.texture ?? Texture.EMPTY)
    });
  }
  override get width(): number {
    return (this.sizeWidth ?? this.texture.width) * Math.abs(this.scale.x);
  }
  override set width(value: number) {
    this.sizeWidth = value / Math.abs(this.scale.x || 1);
  }
  override get height(): number {
    return (this.sizeHeight ?? this.texture.height) * Math.abs(this.scale.y);
  }
  override set height(value: number) {
    this.sizeHeight = value / Math.abs(this.scale.y || 1);
  }
  updateGeometry(): void {
    const w = this.sizeWidth ?? this.texture.width,
      h = this.sizeHeight ?? this.texture.height;
    this.geometry.positions.set([
      -this.anchor.x * w + this.offset.x,
      -this.anchor.y * h + this.offset.y,
      (1 - this.anchor.x) * w + this.offset.x,
      -this.anchor.y * h + this.offset.y,
      -this.anchor.x * w + this.offset.x,
      (1 - this.anchor.y) * h + this.offset.y,
      (1 - this.anchor.x) * w + this.offset.x,
      (1 - this.anchor.y) * h + this.offset.y
    ]);
    this.geometry.getBuffer("aPosition").update();
  }
  override getLocalBounds(): Rectangle {
    const w = this.sizeWidth ?? this.texture.width,
      h = this.sizeHeight ?? this.texture.height;
    return new Rectangle(
      -this.anchor.x * w + this.offset.x,
      -this.anchor.y * h + this.offset.y,
      w,
      h
    );
  }
  override destroy(options: DestroyOptions | boolean = {}): void {
    if (this.destroyed) return;
    this.geometry.destroy();
    super.destroy(options);
  }
}
export class NineSliceSprite extends Sprite {
  override get width(): number {
    return this.sizeWidth ?? this.texture.width;
  }
  override set width(value: number) {
    this.sizeWidth = value;
  }
  override get height(): number {
    return this.sizeHeight ?? this.texture.height;
  }
  override set height(value: number) {
    this.sizeHeight = value;
  }
  override setSize(width: number, height = width): void {
    this.sizeWidth = width;
    this.sizeHeight = height;
  }
  leftWidth: number;
  rightWidth: number;
  topHeight: number;
  bottomHeight: number;
  constructor(options: {
    texture: Texture;
    leftWidth?: number;
    rightWidth?: number;
    topHeight?: number;
    bottomHeight?: number;
  }) {
    super(options.texture);
    this.geometry.native.dispose();
    Object.defineProperty(this, "geometry", { value: grid(4, 4) });
    this.mesh.geometry = this.geometry.native;
    this.leftWidth = options.leftWidth ?? 10;
    this.rightWidth = options.rightWidth ?? 10;
    this.topHeight = options.topHeight ?? 10;
    this.bottomHeight = options.bottomHeight ?? 10;
  }
  override updateGeometry(): void {
    const w = this.sizeWidth ?? this.texture.width,
      h = this.sizeHeight ?? this.texture.height;
    const sx = Math.min(1, w / Math.max(1, this.leftWidth + this.rightWidth)),
      sy = Math.min(1, h / Math.max(1, this.topHeight + this.bottomHeight));
    const xs = [0, this.leftWidth * sx, w - this.rightWidth * sx, w],
      ys = [0, this.topHeight * sy, h - this.bottomHeight * sy, h];
    const us = [
        0,
        this.leftWidth / this.texture.width,
        1 - this.rightWidth / this.texture.width,
        1
      ],
      vs = [
        0,
        this.topHeight / this.texture.height,
        1 - this.bottomHeight / this.texture.height,
        1
      ];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 2;
        this.geometry.positions[i] = (xs[x] ?? 0) - this.anchor.x * w;
        this.geometry.positions[i + 1] = (ys[y] ?? 0) - this.anchor.y * h;
        this.geometry.uvs[i] = us[x] ?? 0;
        this.geometry.uvs[i + 1] = vs[y] ?? 0;
      }
    this.geometry.getBuffer("aPosition").update();
    this.geometry.getBuffer("aUV").update();
  }
}
export class TilingSprite extends Sprite {
  readonly tileScale = new Point(1, 1);
  readonly tilePosition = new Point();
  constructor(options: { texture: Texture; width: number; height: number }) {
    super(options.texture);
    this.width = options.width;
    this.height = options.height;
  }
  override syncMaterial(alpha: number, order: number, mask?: Sprite): void {
    super.syncMaterial(alpha, order, mask);
    this.uniforms.tiled.value = true;
    const tw = this.texture.width * this.tileScale.x,
      th = this.texture.height * this.tileScale.y;
    this.uniforms.tileFactor.value.set(
      (this.sizeWidth ?? this.texture.width) / tw,
      (this.sizeHeight ?? this.texture.height) / th
    );
    this.uniforms.tileOffset.value.set(this.tilePosition.x / tw, this.tilePosition.y / th);
  }
}
export class PerspectiveMesh extends Mesh {
  constructor(options: { texture: Texture; verticesX?: number; verticesY?: number }) {
    super({ texture: options.texture, geometry: grid(2, 2) });
  }
  setCorners(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number
  ): void {
    this.geometry.positions.set([ax, ay, bx, by, dx, dy, cx, cy]);
    const vx = cx - ax,
      vy = cy - ay,
      wx = dx - bx,
      wy = dy - by,
      det = vx * wy - vy * wx;
    const s = det ? ((bx - ax) * wy - (by - ay) * wx) / det : 0.5,
      t = det ? ((bx - ax) * vy - (by - ay) * vx) / det : 0.5;
    const safe = (v: number) => (Math.abs(v) > 1e-8 ? v : 1e-8);
    this.geometry.weights.set([1 / safe(1 - s), 1 / safe(1 - t), 1 / safe(t), 1 / safe(s)]);
    this.geometry.getBuffer("aPosition").update();
    this.geometry.getBuffer("weight").update();
  }
}
