import { Container, UPDATE_PRIORITY } from "pixi.js";
import type { Application, WebGLRenderer } from "pixi.js";
import type { HandsLayer } from "../HandsLayer";
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
  private loading: Promise<void> | undefined;
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
    private readonly keyboard: KeyboardLayer,
    private readonly hands: HandsLayer | undefined
  ) {}

  /** Settles once the keys are drawn by three, or once it is clear that they cannot be. */
  setEnabled(on: boolean): Promise<void> {
    this.wanted = on;
    const loaded = on ? this.load() : Promise.resolve();
    this.sync();
    return loaded;
  }

  /** Whether three draws the keys now, rather than the perspective layer. */
  get on(): boolean {
    return this.active;
  }

  destroy(): void {
    void this.setEnabled(false);
    this.stage?.dispose();
    this.stage = undefined;
  }

  private load(): Promise<void> {
    if (this.stage) return Promise.resolve();
    this.loading ??= this.create();
    return this.loading;
  }

  private async create(): Promise<void> {
    const gl = (this.app.renderer as Partial<WebGLRenderer>).gl;
    // three needs WebGL 2; anything else keeps the perspective keys.
    if (typeof WebGL2RenderingContext === "undefined" || !(gl instanceof WebGL2RenderingContext))
      return;
    try {
      const [{ ThreeStage }, { loadPianoKit }, { loadHand }] = await Promise.all([
        import("./ThreeStage"),
        import("./pianoKit"),
        import("./liveHands")
      ]);
      const [kit, hand] = await Promise.all([
        loadPianoKit(),
        loadHand().catch((error: unknown) => {
          console.warn("3D hands unavailable, keeping the sprite hands", error);
          return undefined;
        })
      ]);
      this.stage = new ThreeStage(this.app.canvas, gl, kit, hand);
    } catch (error) {
      console.warn("3D keys unavailable, keeping the perspective keys", error);
    } finally {
      this.loading = undefined;
      this.sync();
    }
  }

  private sync(): void {
    const on = this.wanted && this.stage !== undefined;
    if (on === this.active) return;
    this.active = on;
    if (this.hands) this.hands.live = on && this.stage?.hands !== undefined;
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
      this.app.ticker.deltaMS / 1000,
      this.hands?.container.visible
        ? { time: this.hands.time, notes: this.hands.songNotes }
        : undefined
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
