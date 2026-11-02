import {
  DataTexture,
  Texture as NativeTexture,
  LinearFilter,
  RGBAFormat,
  LinearSRGBColorSpace,
  UnsignedByteType,
  WebGLRenderTarget
} from "three";
import { Rectangle } from "./math";

type ImageResource = CanvasImageSource | Uint8Array | { width: number; height: number };
export class TextureSource {
  readonly nativeTexture: NativeTexture;
  width: number;
  height: number;
  resolution: number;
  destroyed = false;
  constructor(
    public readonly resource: ImageResource,
    width?: number,
    height?: number,
    resolution = 1,
    native?: NativeTexture
  ) {
    const image = resource as { width?: number; height?: number };
    this.width = width ?? image.width ?? 1;
    this.height = height ?? image.height ?? 1;
    this.resolution = resolution;
    this.nativeTexture =
      native ??
      (resource instanceof Uint8Array
        ? new DataTexture(resource, this.width, this.height, RGBAFormat, UnsignedByteType)
        : new NativeTexture(resource as TexImageSource));
    this.nativeTexture.magFilter = this.nativeTexture.minFilter = LinearFilter;
    this.nativeTexture.generateMipmaps = false;
    this.nativeTexture.flipY = false;
    this.nativeTexture.colorSpace = LinearSRGBColorSpace;
    this.nativeTexture.needsUpdate = true;
  }
  get pixelWidth(): number {
    return this.width * this.resolution;
  }
  get pixelHeight(): number {
    return this.height * this.resolution;
  }
  resize(width: number, height: number, resolution = this.resolution): void {
    this.width = width;
    this.height = height;
    this.resolution = resolution;
  }
  update(): void {
    this.nativeTexture.needsUpdate = true;
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.nativeTexture.dispose();
  }
}
export class BufferImageSource extends TextureSource {
  constructor(options: {
    resource: Uint8Array;
    width: number;
    height: number;
    alphaMode?: string;
  }) {
    super(options.resource, options.width, options.height);
  }
}
export class Texture {
  static readonly WHITE = new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array([255, 255, 255, 255]),
      width: 1,
      height: 1
    })
  });
  static readonly EMPTY = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 })
  });
  readonly source: TextureSource;
  private readonly explicitFrame: Rectangle | undefined;
  destroyed = false;
  constructor(options: { source: TextureSource; frame?: Rectangle }) {
    this.source = options.source;
    this.explicitFrame = options.frame;
  }
  get frame(): Rectangle {
    return this.explicitFrame ?? new Rectangle(0, 0, this.source.width, this.source.height);
  }
  get width(): number {
    return this.frame.width;
  }
  get height(): number {
    return this.frame.height;
  }
  get nativeTexture(): NativeTexture {
    return this.source.nativeTexture;
  }
  static from(resource: CanvasImageSource): Texture {
    return new Texture({ source: new TextureSource(resource) });
  }
  destroy(destroySource = false): void {
    if (this === Texture.WHITE || this === Texture.EMPTY || this.destroyed) return;
    this.destroyed = true;
    if (destroySource) this.source.destroy();
  }
}
export class RenderTexture extends Texture {
  readonly renderTarget: WebGLRenderTarget;
  private constructor(width: number, height: number, resolution: number) {
    const target = new WebGLRenderTarget(
      Math.ceil(width * resolution),
      Math.ceil(height * resolution),
      { depthBuffer: false, stencilBuffer: false }
    );
    super({
      source: new TextureSource(new Uint8Array(4), width, height, resolution, target.texture)
    });
    this.renderTarget = target;
    const resize = this.source.resize.bind(this.source);
    this.source.resize = (w, h, resolution) => {
      const r = resolution ?? this.source.resolution;
      resize(w, h, r);
      target.setSize(Math.max(1, Math.ceil(w * r)), Math.max(1, Math.ceil(h * r)));
    };
  }
  static create(options: { width: number; height: number; resolution?: number }): RenderTexture {
    return new RenderTexture(options.width, options.height, options.resolution ?? 1);
  }
  override destroy(destroySource = false): void {
    if (this.destroyed) return;
    super.destroy(destroySource);
    this.renderTarget.dispose();
  }
}
const cache = new Map<string, Promise<Texture>>();
export const Assets = {
  load<T = Texture>(url: string): Promise<T> {
    let pending = cache.get(url);
    if (!pending) {
      pending = new Promise<Texture>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          resolve(Texture.from(image));
        };
        image.onerror = () => {
          reject(new Error("Image unavailable: " + url));
        };
        image.src = url;
      });
      cache.set(url, pending);
      pending.catch(() => cache.delete(url));
    }
    return pending as Promise<T>;
  },
  async unload(url: string | string[]): Promise<void> {
    if (Array.isArray(url)) {
      await Promise.all(url.map((value) => Assets.unload(value)));
      return;
    }
    const pending = cache.get(url);
    cache.delete(url);
    (await pending)?.destroy(true);
  }
};
