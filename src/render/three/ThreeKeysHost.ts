import { Container, Texture, UPDATE_PRIORITY } from "pixi.js";
import type { Camera } from "three";
import type { HandsSource } from "./liveHands";
import type { Application, WebGLRenderer } from "pixi.js";
import type { HandsLayer } from "../HandsLayer";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { KeysScene, PerspectiveKeyboardLayer } from "../PerspectiveKeyboardLayer";
import type { EnergySource } from "../noteEnergy";
import type { Pianist } from "./pianist";
import type { ThreeStage } from "./ThreeStage";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { SharedTextureBindings } from "./SharedTextureBindings";
import { SceneEffectsPass } from "./SceneEffectsPass";
import { NativeKeyContacts } from "./NativeKeyContacts";
import { disposePianistModel } from "./disposePianistModel";

/**
 * Puts the three.js keys between the road and everything over it. While on, the app's own render
 * leaves the ticker and each frame is drawn in passes on one WebGL context: the road and neutral mist,
 * the keys, then the rest of the stage. Until three has loaded, or if it cannot, the perspective keys
 * stay as they are.
 */
export class ThreeKeysHost {
  private stage: ThreeStage | undefined;
  private loading: Promise<void> | undefined;
  private wanted = false;
  private keyboardDim = false;
  private active = false;
  private freeWanted = false;
  private performanceWanted = false;
  get performanceScene(): boolean {
    return this.performanceWanted && this.drawsRoad;
  }
  private freeActive = false;
  onFreeCamera: ((on: boolean) => void) | undefined;
  private sharedBindings: SharedTextureBindings | undefined;
  private destroyed = false;
  private energy: readonly EnergySource[] = [];
  private roadFrame: ThreeRoadFrame | undefined;
  private energyDeltaSeconds: number | undefined;
  /** The local pianist behind the keys, once asked for and loaded. */
  private pianist: Pianist | undefined;
  private pianistLoading = false;
  private pianistStage: ThreeStage | undefined;
  private pianistIdentity: string | undefined;
  private pianistGeneration = 0;
  private pianistAttempted = false;
  private frameHands: HandsSource | undefined;
  private readonly nativeContacts = new NativeKeyContacts();
  /**
   * Holds the road's place on the stage while the road is drawn on its own: a container on the
   * stage cannot be drawn alone, its parent's visibility decides its children's.
   */
  private readonly placeholder = new Container();
  private readonly effects = new SceneEffectsPass();
  private readonly roadEffects = new SceneEffectsPass();

  constructor(
    private readonly app: Application,
    /** The road's container: drawn first, on its own. */
    private readonly road: Container,
    private readonly keys: PerspectiveKeyboardLayer,
    private readonly keyboard: KeyboardLayer,
    private readonly hands: HandsLayer | undefined,
    private readonly restoreRoad?: () => void
  ) {
    // Registered before Three's listener: restored contexts also inherit Pixi's upload state.
    app.canvas.addEventListener("webglcontextrestored", this.contextRestored);
  }

  private readonly contextRestored = (): void => {
    this.resetPixiState();
    // Three rebuilds its renderer later in this event; invalidate Pixi's caches afterwards.
    queueMicrotask(() => {
      if (!this.destroyed) this.resetPixiState();
    });
  };

  /** Settles once the keys are drawn by three, or once it is clear that they cannot be. */
  setEnabled(on: boolean): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.wanted = on;
    const loaded = on ? this.load() : Promise.resolve();
    this.sync();
    return loaded;
  }

  /** Whether three draws the keys now, rather than the perspective layer. */
  get on(): boolean {
    return this.active;
  }

  get drawsRoad(): boolean {
    return (
      this.active &&
      this.road.visible &&
      this.keys.container.visible &&
      this.keys.scene !== undefined
    );
  }

  /** The same snapshot that feeds the road's plasma and local burning. */
  setEnergy(sources: readonly EnergySource[], deltaSeconds?: number): void {
    this.energy = sources;
    this.energyDeltaSeconds = deltaSeconds;
  }

  setRoadFrame(frame: ThreeRoadFrame): void {
    this.roadFrame = frame;
  }

  setSceneEffects(layers: readonly Container[], roadLayers: readonly Container[] = []): void {
    this.effects.setLayers(layers);
    this.roadEffects.setLayers(roadLayers);
  }

  setKeyboardDim(dim: boolean): void {
    this.keyboardDim = dim;
    this.stage?.setKeyboardDim(dim);
  }

  setFreeCamera(on: boolean): void {
    this.freeWanted = on;
    this.syncFreeCamera();
  }

  setPerformanceScene(on: boolean): void {
    this.performanceWanted = on;
    this.stage?.setPerformanceScene(on);
    this.syncFreeCamera();
  }

  get freeCamera(): boolean {
    return this.freeActive;
  }

  get sceneCamera(): boolean {
    return this.drawsRoad && (this.freeActive || this.performanceWanted);
  }

  resetFreeCamera(): void {
    this.stage?.resetFreeCamera();
  }

  freeKeysPointAt(x: number, y: number): { x: number; y: number } | undefined {
    const scene = this.keys.scene;
    if (!this.sceneCamera || !scene) return undefined;
    const pitch = this.stage?.freeKeyAt(x, y, this.app.screen.width, this.app.screen.height);
    const face = scene.faces.find(({ key }) => key.pitch === pitch);
    return (
      face && { x: face.key.x + face.key.width / 2, y: face.source.y + face.source.height / 2 }
    );
  }

  private syncFreeCamera(layered = this.active): void {
    const on = this.freeWanted && !this.performanceWanted && this.active && layered;
    if (on === this.freeActive) return;
    this.freeActive = on;
    this.stage?.setFreeCamera(on);
    this.onFreeCamera?.(on);
  }

  clearEnergy(): void {
    this.energy = [];
    this.energyDeltaSeconds = undefined;
    this.stage?.clearEnergy();
  }

  destroy(): void {
    if (this.destroyed) return;
    void this.setEnabled(false);
    this.destroyed = true;
    this.app.canvas.removeEventListener("webglcontextrestored", this.contextRestored);
    this.clearEnergy();
    this.pianistGeneration++;
    this.releasePianist();
    this.effects.dispose();
    this.roadEffects.dispose();
    this.stage?.dispose();
    this.stage = undefined;
  }

  private resetPixiState(): void {
    const renderer = this.app.renderer as WebGLRenderer;
    if (this.sharedBindings) {
      let empty: WebGLTexture | null = null;
      try {
        empty = renderer.texture.getGlSource(Texture.EMPTY.source).texture;
      } catch {
        /* Keep the fallback usable even when a texture upload failed. */
      }
      this.sharedBindings.release(empty);
    }
    renderer.resetState();
  }

  private load(): Promise<void> {
    if (this.stage) return Promise.resolve();
    this.loading ??= this.create();
    return this.loading;
  }

  private async create(): Promise<void> {
    const renderer = this.app.renderer;
    const gl = (renderer as Partial<WebGLRenderer>).gl;
    // three needs WebGL 2; anything else keeps the perspective keys.
    if (typeof WebGL2RenderingContext === "undefined" || !(gl instanceof WebGL2RenderingContext))
      return;
    this.sharedBindings ??= new SharedTextureBindings(gl);
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
      if (this.destroyed) return;
      // Three creates empty 3D textures in its constructor: Pixi's upload flags must be off.
      this.resetPixiState();
      try {
        this.stage = new ThreeStage(this.app.canvas, gl, kit, hand);
        this.stage.beforeRender = this.beforeRender;
        this.stage.setKeyboardDim(this.keyboardDim);
        this.stage.setPerformanceScene(this.performanceWanted);
      } finally {
        // Construction also changes GL bindings, even if 3D was disabled while loading.
        this.resetPixiState();
      }
    } catch (error) {
      console.warn("3D keys unavailable, keeping the perspective keys", error);
    } finally {
      this.loading = undefined;
      if (!this.destroyed) this.sync();
    }
  }

  private sync(): void {
    const on = this.wanted && this.stage !== undefined;
    if (on === this.active) return;
    this.active = on;
    this.syncFreeCamera();
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
    this.syncFreeCamera(Boolean(layered));
    if (!layered || !this.stage) {
      renderer.render({ container: stage });
      return;
    }
    const gl = renderer as WebGLRenderer;
    // three left its own state (clear colour, blending) behind last frame.
    this.resetPixiState();
    const separateRoad = this.freeActive || this.performanceWanted;
    const worldEffects = this.performanceWanted && this.stage.nativeEffectsReady;
    renderer.render({
      container: separateRoad ? this.placeholder : this.road,
      ...(this.performanceWanted ? { clearColor: 0x000000 } : {})
    });
    try {
      if (separateRoad) this.roadEffects.draw(renderer, !worldEffects);
      this.effects.draw(renderer, !worldEffects);
      this.seatPianist(this.stage, scene);
      const picture = gl.texture.getGlSource(scene.texture.source).texture;
      const frame = this.keyboard.frame;
      const hands =
        this.hands && (this.hands.container.visible || this.hands.pianist)
          ? {
              time: this.hands.time,
              notes: this.hands.songNotes,
              beats: this.hands.songBeats,
              performance: this.hands.songPerformance
            }
          : undefined;
      this.frameHands = hands;
      // Live hands press the keys they play themselves: a repeated note's key comes up between.
      const native = this.hands?.pianist === true && this.pianist?.native === true;
      if (native) this.nativeContacts.setNotes(this.hands.songNotes);
      const played = hands !== undefined && this.stage.hands !== undefined && !native;
      this.stage.setSongStage(this.hands?.songStage);
      this.stage.draw(
        scene,
        picture,
        (pitch) =>
          frame?.pressed.has(pitch) === true ||
          (native
            ? this.nativeContacts.down(pitch, hands?.time ?? 0)
            : frame !== undefined && !played && frame.sounding.has(pitch)),
        this.app.screen,
        this.app.ticker.deltaMS / 1000,
        hands,
        this.energy,
        this.energyDeltaSeconds,
        this.roadFrame,
        worldEffects,
        this.hands?.songNotes
      );
    } catch (error) {
      this.effects.restore();
      this.roadEffects.restore();
      console.warn("3D keys failed, keeping the perspective keys", error);
      // Restore the road, keys, sprite hands and normal ticker before drawing this frame again.
      void this.setEnabled(false);
      this.stage.dispose();
      this.stage = undefined;
      this.resetPixiState();
      this.restoreRoad?.();
      this.resetPixiState();
      renderer.render({ container: stage });
      return;
    }
    try {
      this.resetPixiState();
      renderer.render({ container: stage, clear: false });
    } finally {
      this.effects.restore();
      this.roadEffects.restore();
    }
  };

  private readonly beforeRender = (camera: Camera): void => {
    if (!this.hands?.pianist || !this.pianist) return;
    if (this.pianist.native) this.pianist.sample(this.frameHands, camera);
    else if (this.stage?.hands)
      this.pianist.poseFallback(this.stage.hands.poses, this.frameHands, camera);
  };

  private releasePianist(): void {
    if (this.pianist) {
      this.pianistStage?.removeFromKeys(this.pianist.space);
      this.pianist.dispose();
    }
    this.pianist = undefined;
    this.pianistStage = undefined;
  }

  private sourceIdentity(): string {
    const source = this.hands?.songPerformance;
    return source
      ? JSON.stringify([source.id, source.midiSha256, source.sourceSha256, source.durationSeconds])
      : "none";
  }

  /** A restored source package supersedes a previously loaded unrelated trial, including pending loads. */
  private seatPianist(stage: ThreeStage, keys: KeysScene): void {
    const source = this.hands?.songPerformance;
    const identity = this.sourceIdentity();
    if (identity !== this.pianistIdentity) {
      this.pianistIdentity = identity;
      this.pianistGeneration++;
      this.pianistLoading = false;
      this.pianistAttempted = false;
      this.releasePianist();
    }
    const wanted = this.hands?.pianist === true;
    if (wanted && !this.pianist && !this.pianistLoading && !this.pianistAttempted) {
      this.pianistLoading = this.pianistAttempted = true;
      const generation = this.pianistGeneration;
      void import("./pianist")
        .then(async ({ Pianist, loadPianist }) => {
          const model = await loadPianist(source);
          if (!model) return;
          if (
            this.destroyed ||
            generation !== this.pianistGeneration ||
            identity !== this.sourceIdentity()
          ) {
            disposePianistModel(model.scene);
            return;
          }
          try {
            this.pianist = new Pianist(model, source);
          } catch (error) {
            disposePianistModel(model.scene);
            throw error;
          }
        })
        .catch((error: unknown) => {
          console.warn("Local pianist unavailable", error);
        })
        .finally(() => {
          if (generation === this.pianistGeneration) this.pianistLoading = false;
        });
    }
    const pianist = this.pianist;
    stage.setNativePianist(wanted && pianist?.native === true);
    if (this.hands)
      this.hands.live =
        this.active && (stage.hands !== undefined || (wanted && pianist?.native === true));
    stage.hands?.setPlayer(undefined);
    pianist?.rig?.setNativeHandsVisible(false);
    if (!pianist) return;
    pianist.space.visible = wanted;
    if (!wanted) return;
    if (this.pianistStage !== stage) {
      stage.addToKeys(pianist.space);
      this.pianistStage = stage;
    }
    const camera = keys.keyboardCamera ?? keys.roadCamera ?? keys.camera;
    pianist.setTopView(
      !this.freeActive && !this.performanceWanted && camera.params.prefs.pitch === 90
    );
    pianist.follow(keys);
  }

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
