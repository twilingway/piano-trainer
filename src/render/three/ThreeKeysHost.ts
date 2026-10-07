import { Container, UPDATE_PRIORITY } from "pixi.js";
import type { Application, WebGLRenderer } from "pixi.js";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { PerspectiveKeyboardLayer } from "../PerspectiveKeyboardLayer";
import type { ThreeStage } from "./ThreeStage";

/**
 * Puts the three.js keys between the road and everything over it. While on, the app's own render
 * leaves the ticker and each frame is drawn in three passes on one WebGL context: the road, the
 * keys, then the rest of the stage. Until three has loaded, or if it cannot, the perspective keys
 * stay as they are.
 */
export class ThreeKeysHost {
  private stage: ThreeStage | undefined;
  private loading = false;
  private wanted = false;
  private active = false;
  /**
   * Holds the road's place on the stage while the road is drawn on its own: a container on the
   * stage cannot be drawn alone, its parent's visibility decides its children's.
   */
  private readonly placeholder = new Container();

  constructor(
    private readonly app: Application,
    /** The road's container: drawn first, on its own. */
    private readonly road: Container,
    private readonly keys: PerspectiveKeyboardLayer,
    private readonly keyboard: KeyboardLayer
  ) {}

  setEnabled(on: boolean): void {
    this.wanted = on;
    if (on) void this.load();
    this.sync();
  }

  destroy(): void {
    this.setEnabled(false);
    this.stage?.dispose();
    this.stage = undefined;
  }

  private async load(): Promise<void> {
    if (this.stage || this.loading) return;
    const gl = (this.app.renderer as Partial<WebGLRenderer>).gl;
    // three needs WebGL 2; anything else keeps the perspective keys.
    if (typeof WebGL2RenderingContext === "undefined" || !(gl instanceof WebGL2RenderingContext))
      return;
    this.loading = true;
    try {
      const { ThreeStage } = await import("./ThreeStage");
      this.stage = new ThreeStage(this.app.canvas, gl);
    } catch (error) {
      console.warn("3D keys unavailable, keeping the perspective keys", error);
    } finally {
      this.loading = false;
      this.sync();
    }
  }

  private sync(): void {
    const on = this.wanted && this.stage !== undefined;
    if (on === this.active) return;
    this.active = on;
    const { ticker } = this.app;
    // The ticker calls the app's render with the app as `this`, as Pixi itself added it.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const render = this.app.render;
    if (on) {
      ticker.remove(render, this.app);
      ticker.add(this.frame, undefined, UPDATE_PRIORITY.LOW);
    } else {
      ticker.remove(this.frame);
      ticker.add(render, this.app, UPDATE_PRIORITY.LOW);
      this.layer(false);
    }
  }

  private readonly frame = (): void => {
    const { renderer, stage } = this.app;
    const scene = this.keys.scene;
    const layered =
      this.stage !== undefined && this.road.visible && this.keys.container.visible && scene;
    this.layer(Boolean(layered));
    if (!layered || !this.stage) {
      renderer.render({ container: stage });
      return;
    }
    const gl = renderer as WebGLRenderer;
    // three left its own state (clear colour, blending) behind last frame.
    renderer.resetState();
    renderer.render({ container: this.road });
    const picture = gl.texture.getGlSource(scene.texture.source).texture;
    const frame = this.keyboard.frame;
    this.stage.draw(
      scene,
      picture,
      (pitch) => frame !== undefined && (frame.pressed.has(pitch) || frame.sounding.has(pitch)),
      this.app.screen,
      this.app.ticker.deltaMS / 1000
    );
    renderer.resetState();
    renderer.render({ container: stage, clear: false });
  };

  /** The road off the stage, drawn first, and three's keys in the Pixi keys' place; or back. */
  private layer(on: boolean): void {
    const stage = this.app.stage;
    const from = on ? this.road : this.placeholder;
    if (from.parent !== stage) return;
    const index = stage.getChildIndex(from);
    stage.removeChildAt(index);
    stage.addChildAt(on ? this.placeholder : this.road, index);
    this.keys.container.renderable = !on;
  }
}
