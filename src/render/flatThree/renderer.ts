import { blurSampleStep, unpremultiplyPixels } from "./rendererMath";
import {
  Color,
  LinearSRGBColorSpace,
  Mesh as NativeMesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderer as NativeRenderer,
  WebGLRenderTarget,
  AdditiveBlending,
  NormalBlending
} from "three";
import { Matrix, Rectangle } from "./math";
import type { Container } from "./scene";
import { Mesh, Sprite } from "./meshes";

import { RenderTexture, BufferImageSource, Texture } from "./textures";

export enum RendererType {
  WEBGL = 1,
  WEBGPU = 2
}
export interface RenderOptions {
  container: Container;
  target?: RenderTexture;
  clear?: boolean;
  transform?: Matrix;
  clearColor?: number | number[];
}
interface BlurPass {
  stepSize: Vector2;
  target: WebGLRenderTarget;
  material: ShaderMaterial;
  mesh: NativeMesh;
}
const blurVertex =
  "varying vec2 sampleUV; void main(){sampleUV=uv;gl_Position=vec4(position.xy,0.,1.);}";
const blurFragment = `
uniform sampler2D picture;uniform vec2 stepSize;varying vec2 sampleUV;
void main(){vec4 total=vec4(0.);float weight=0.;
 for(int x=-3;x<=3;x++){for(int y=-3;y<=3;y++){float w=exp(-float(x*x+y*y)/4.5);vec4 c=texture2D(picture,sampleUV+vec2(float(x),float(y))*stepSize);total+=c*w;weight+=w;}}
 total/=weight;gl_FragColor=vec4(total.a>0.?total.rgb/total.a:vec3(0.),total.a);
}`;
export class Renderer {
  readonly type = RendererType.WEBGL;
  readonly screen = new Rectangle();
  readonly threeRenderer: NativeRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  resolution: number;
  background: number;
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -100, 100);
  private readonly scene = new Scene();
  private readonly passes = new Map<Container, BlurPass>();
  private order = 0;
  constructor(options: {
    canvas: HTMLCanvasElement;
    context: WebGL2RenderingContext;
    resolution?: number;
    background?: number;
    antialias?: boolean;
  }) {
    this.canvas = options.canvas;
    this.gl = options.context;
    this.resolution = options.resolution ?? 1;
    this.background = options.background ?? 0;
    this.threeRenderer = new NativeRenderer({
      canvas: this.canvas,
      context: this.gl,
      alpha: true,
      antialias: options.antialias ?? true,
      premultipliedAlpha: true
    });
    this.threeRenderer.autoClear = false;
    this.threeRenderer.outputColorSpace = LinearSRGBColorSpace;
    this.threeRenderer.setPixelRatio(this.resolution);
  }
  resize(width: number, height: number): void {
    this.screen.width = Math.max(1, width);
    this.screen.height = Math.max(1, height);
    this.threeRenderer.setSize(this.screen.width, this.screen.height, false);
    this.canvas.style.width = String(this.screen.width) + "px";
    this.canvas.style.height = String(this.screen.height) + "px";
  }
  resetState(): void {
    this.threeRenderer.resetState();
  }
  render(options: RenderOptions): void {
    const r = this.threeRenderer,
      target = options.target;
    const priorTarget = r.getRenderTarget(),
      viewport = r.getViewport(new Vector4()),
      scissor = r.getScissor(new Vector4()),
      scissorTest = r.getScissorTest();
    const color = r.getClearColor(new Color()),
      alpha = r.getClearAlpha();
    const width = target?.width ?? this.screen.width,
      height = target?.height ?? this.screen.height;
    const priorCamera = {
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom
    };
    try {
      this.camera.right = width;
      this.camera.top = target ? height : 0;
      this.camera.bottom = target ? 0 : height;
      this.camera.updateProjectionMatrix();
      r.setRenderTarget(target?.renderTarget ?? null);
      r.setScissorTest(false);
      r.setViewport(
        0,
        0,
        target ? Math.ceil(width * target.source.resolution) / r.getPixelRatio() : width,
        target ? Math.ceil(height * target.source.resolution) / r.getPixelRatio() : height
      );
      const clear = options.clearColor;
      r.setClearColor(
        typeof clear === "number"
          ? new Color().setHex(clear, LinearSRGBColorSpace)
          : Array.isArray(clear)
            ? new Color().setRGB(clear[0] ?? 0, clear[1] ?? 0, clear[2] ?? 0)
            : target
              ? 0
              : new Color().setHex(this.background, LinearSRGBColorSpace),
        Array.isArray(clear) ? (clear[3] ?? 0) : target ? 0 : 1
      );
      if (options.clear !== false) r.clear(true, true, true);
      this.order = 0;
      this.scene.clear();
      const local = options.container.localMatrix();
      const det = local.a * local.d - local.b * local.c;
      const inverse = det
        ? new Matrix(
            local.d / det,
            -local.b / det,
            -local.c / det,
            local.a / det,
            (local.c * local.ty - local.d * local.tx) / det,
            (local.b * local.tx - local.a * local.ty) / det
          )
        : new Matrix();
      const parent = options.transform
        ? new Matrix().copyFrom(options.transform).append(inverse)
        : new Matrix();
      this.collect(options.container, parent, 1, undefined, width, height, false);
      r.render(this.scene, this.camera);
    } finally {
      this.scene.clear();
      this.camera.right = priorCamera.right;
      this.camera.top = priorCamera.top;
      this.camera.bottom = priorCamera.bottom;
      this.camera.updateProjectionMatrix();
      r.setRenderTarget(priorTarget);
      r.setViewport(viewport);
      r.setScissor(scissor);
      r.setScissorTest(scissorTest);
      r.setClearColor(color, alpha);
    }
  }
  private collect(
    node: Container,
    parent: Matrix,
    alpha: number,
    mask: Sprite | undefined,
    width: number,
    height: number,
    skipFilter: boolean
  ): void {
    if (!node.visible || !node.renderable || node.destroyed || node.alpha <= 0) return;
    const m = new Matrix().copyFrom(parent).append(node.localMatrix());
    const ownAlpha = alpha * node.alpha,
      ownMask = node.mask instanceof Sprite ? node.mask : mask;
    if (node.filters.length && !skipFilter) {
      this.filtered(node, parent, alpha, mask, width, height);
      return;
    }
    const baker = node as Container & { ensureBaked?: () => void };
    baker.ensureBaked?.();
    if (node instanceof Sprite) node.updateGeometry();
    if (node instanceof Mesh) {
      node.syncMaterial(ownAlpha, this.order++, ownMask);
      const native = node.mesh;
      native.matrixAutoUpdate = false;
      native.matrix.set(m.a, m.c, 0, m.tx, m.b, m.d, 0, m.ty, 0, 0, 1, 0, 0, 0, 0, 1);
      // Flat meshes live in a renderer-owned scene; node hierarchy owns only logical transforms.
      this.scene.add(native);
    }
    const children = node.sortableChildren
      ? [...node.children].sort((a, b) => a.zIndex - b.zIndex)
      : node.children;
    for (const child of children) this.collect(child, m, ownAlpha, ownMask, width, height, false);
  }
  private filtered(
    node: Container,
    parent: Matrix,
    alpha: number,
    mask: Sprite | undefined,
    width: number,
    height: number
  ): void {
    const r = this.threeRenderer;
    let pass = this.passes.get(node);
    if (!pass) {
      const target = new WebGLRenderTarget(
        Math.ceil(width * this.resolution),
        Math.ceil(height * this.resolution),
        { depthBuffer: false }
      );
      const stepSize = new Vector2();
      const material = new ShaderMaterial({
        vertexShader: blurVertex,
        fragmentShader: blurFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { picture: { value: target.texture }, stepSize: { value: stepSize } }
      });
      const mesh = new NativeMesh(new PlaneGeometry(2, 2), material);
      mesh.frustumCulled = false;
      pass = { target, material, mesh, stepSize };
      this.passes.set(node, pass);
      const owned = pass;
      node.once("destroyed", () => {
        owned.target.dispose();
        owned.material.dispose();
        owned.mesh.geometry.dispose();
        this.passes.delete(node);
      });
    }
    const savedScene = this.scene.children.slice(),
      savedOrder = this.order;
    this.scene.clear();
    this.order = 0;
    const oldTarget = r.getRenderTarget(),
      viewport = r.getViewport(new Vector4()),
      color = r.getClearColor(new Color()),
      oldAlpha = r.getClearAlpha();
    const pw = Math.ceil(width * this.resolution),
      ph = Math.ceil(height * this.resolution);
    if (pass.target.width !== pw || pass.target.height !== ph) pass.target.setSize(pw, ph);
    try {
      r.setRenderTarget(pass.target);
      r.setViewport(0, 0, pw / r.getPixelRatio(), ph / r.getPixelRatio());
      r.setClearColor(0, 0);
      r.clear();
      this.collect(node, parent, alpha, mask, width, height, true);
      r.render(this.scene, this.camera);
    } finally {
      this.scene.clear();
      for (const mesh of savedScene) this.scene.add(mesh);
      this.order = savedOrder;
      r.setRenderTarget(oldTarget);
      r.setViewport(viewport);
      r.setClearColor(color, oldAlpha);
    }
    const strength = node.filters.reduce((value, filter) => Math.max(value, filter.strength), 0);
    const step = blurSampleStep(strength, pw, ph, this.resolution);
    pass.stepSize.set(step.x, step.y);
    pass.material.blending = node.filters.some((filter) => filter.blendMode === "add")
      ? AdditiveBlending
      : NormalBlending;
    pass.mesh.renderOrder = this.order++;
    this.scene.add(pass.mesh);
  }
  generateTexture(options: {
    target: Container;
    resolution?: number;
    antialias?: boolean;
  }): Texture {
    const b = options.target.getLocalBounds(),
      pad = options.target.filters.reduce((n, f) => Math.max(n, f.strength * 2), 0);
    const width = Math.max(1, Math.ceil(b.width + pad * 2)),
      height = Math.max(1, Math.ceil(b.height + pad * 2));
    const target = RenderTexture.create({
      width,
      height,
      resolution: options.resolution ?? this.resolution
    });
    const shift = new Matrix(1, 0, 0, 1, -b.x + pad, -b.y + pad);
    try {
      this.render({ container: options.target, target, clear: true, transform: shift });
      const pw = target.renderTarget.width,
        ph = target.renderTarget.height;
      const pixels = new Uint8Array(pw * ph * 4);
      this.threeRenderer.readRenderTargetPixels(target.renderTarget, 0, 0, pw, ph, pixels);
      unpremultiplyPixels(pixels);
      // CPU-backed pixels survive WebGL context restoration after the baking nodes are destroyed.
      const source = new BufferImageSource({ resource: pixels, width: pw, height: ph });
      source.resize(width, height, target.source.resolution);
      return new Texture({ source });
    } finally {
      target.destroy(true);
    }
  }
  destroy(): void {
    for (const pass of this.passes.values()) {
      pass.target.dispose();
      pass.material.dispose();
      pass.mesh.geometry.dispose();
    }
    this.passes.clear();
    this.threeRenderer.dispose();
  }
}
export type WebGLRenderer = Renderer;
