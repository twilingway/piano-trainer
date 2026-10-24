import { Container, type DestroyOptions } from "./scene";
import { Renderer } from "./renderer";
import { Rectangle } from "./math";
import { bindPointerEvents } from "./input";
import { GraphicsInitializationError } from "../graphicsFailure";
export const UPDATE_PRIORITY = { HIGH: 50, NORMAL: 0, LOW: -50, UTILITY: -100 };
type Callback = (ticker: Ticker) => void;
export class Ticker {
  deltaMS = 16.667;
  elapsedMS = 16.667;
  lastTime = 0;
  private callbacks: { callback: Callback; context: unknown; priority: number }[] = [];
  get FPS(): number {
    return 1000 / this.elapsedMS;
  }
  add(callback: Callback, context?: unknown, priority = 0): this {
    this.callbacks.push({ callback, context, priority });
    this.callbacks.sort((a, b) => b.priority - a.priority);
    return this;
  }
  remove(callback: Callback, context?: unknown): this {
    this.callbacks = this.callbacks.filter(
      (item) => item.callback !== callback || (context !== undefined && context !== item.context)
    );
    return this;
  }
  update(now: number): void {
    this.deltaMS = this.elapsedMS = this.lastTime ? now - this.lastTime : 16.667;
    this.lastTime = now;
    for (const item of [...this.callbacks]) item.callback.call(item.context, this);
  }
  destroy(): void {
    this.callbacks = [];
  }
}
export class Application {
  readonly stage = new Container();
  readonly ticker = new Ticker();
  readonly screen = new Rectangle();
  private initializedCanvas: HTMLCanvasElement | undefined;
  private initializedRenderer: Renderer | undefined;
  get canvas(): HTMLCanvasElement {
    if (!this.initializedCanvas) throw new Error("Application canvas is not initialized");
    return this.initializedCanvas;
  }
  get renderer(): Renderer {
    if (!this.initializedRenderer) throw new Error("Application renderer is not initialized");
    return this.initializedRenderer;
  }
  private host: HTMLElement | undefined;
  private frame = 0;
  private disposed = false;
  private unbind: (() => void) | undefined;
  private contextLost = false;
  init(options: {
    resizeTo: HTMLElement;
    background?: number;
    resolution?: number;
    autoDensity?: boolean;
    antialias?: boolean;
  }): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }
      if (typeof WebGL2RenderingContext === "undefined")
        throw new GraphicsInitializationError("unsupported");
      this.initializedCanvas = document.createElement("canvas");
      const context = this.canvas.getContext("webgl2", {
        alpha: true,
        antialias: options.antialias ?? true,
        premultipliedAlpha: true
      });
      if (!context) throw new GraphicsInitializationError("unavailable");
      try {
        this.initializedRenderer = new Renderer({
          canvas: this.canvas,
          context,
          resolution: options.resolution ?? 1,
          background: options.background ?? 0,
          antialias: options.antialias ?? true
        });
      } catch {
        throw new GraphicsInitializationError("unavailable");
      }
      this.host = options.resizeTo;
      this.queueResize();
      this.unbind = bindPointerEvents(this.canvas, this.stage, this.screen);
      this.canvas.addEventListener("webglcontextlost", this.lost);
      this.canvas.addEventListener("webglcontextrestored", this.restored);
      this.ticker.add(this.render, this, UPDATE_PRIORITY.LOW);
      this.frame = requestAnimationFrame(this.tick);
      resolve();
    });
  }
  private readonly lost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
  };
  private readonly restored = () => {
    this.contextLost = false;
  };
  private readonly tick = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (!this.contextLost) this.ticker.update(time);
  };
  readonly render = (): void => {
    if (!this.disposed && !this.contextLost && this.initializedRenderer)
      this.initializedRenderer.render({ container: this.stage });
  };
  queueResize(): void {
    if (!this.host || !this.initializedRenderer) return;
    const b = this.host.getBoundingClientRect();
    this.screen.width = Math.max(1, b.width);
    this.screen.height = Math.max(1, b.height);
    this.initializedRenderer.resize(this.screen.width, this.screen.height);
  }
  destroy(
    options: { removeView?: boolean } | boolean = {},
    stageOptions: DestroyOptions = {}
  ): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.unbind?.();
    this.unbind = undefined;
    this.ticker.destroy();
    this.stage.destroy(stageOptions);
    this.initializedCanvas?.removeEventListener("webglcontextlost", this.lost);
    this.initializedCanvas?.removeEventListener("webglcontextrestored", this.restored);
    this.initializedRenderer?.destroy();
    if (options === true || (typeof options === "object" && options.removeView))
      this.initializedCanvas?.remove();
  }
}
