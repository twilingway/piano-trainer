import type { StaffWorldSource } from "../../staff/staffWorldSnapshot";
import { Container, UPDATE_PRIORITY } from "../flatThree";
import { Vector2, type Camera } from "three";
import type { HandsSource } from "./liveHands";
import type { Application } from "../flatThree";
import type { HandsLayer } from "../HandsLayer";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { KeysScene, NativeKeyboardScene } from "../NativeKeyboardScene";
import type { EnergySource } from "../noteEnergy";
import { ALL_FLAT_EFFECTS, type FlatEffectOptions } from "../flatEffectSettings";
import type { Pianist } from "./pianist";
import type { ThreeStage } from "./ThreeStage";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { FlatSceneLayers } from "./FlatSceneLayers";
import { NativeKeyContacts } from "./NativeKeyContacts";
import { disposePianistModel } from "./disposePianistModel";
import { metricC4X, metricKeyX } from "../keyboardMetrics";
import { Keyboard88PerformerHost } from "./Keyboard88PerformerHost";

/** Composes one native road with either native or flat keys on the shared renderer. */
export class ThreeKeysHost {
  private stage: ThreeStage | undefined;
  private loading: Promise<void> | undefined;
  private loadFailed = false;
  private wanted = false;
  private roadWanted = false;
  private keyboardDim = false;
  private active = false;
  private freeWanted = false;
  private performanceWanted = false;
  get performanceScene(): boolean {
    return this.performanceWanted && this.sceneVisible;
  }
  private freeActive = false;
  onFreeCamera: ((on: boolean) => void) | undefined;
  private destroyed = false;
  private energy: readonly EnergySource[] = [];
  private effectOptions: FlatEffectOptions = ALL_FLAT_EFFECTS;
  private roadFrame: ThreeRoadFrame | undefined;
  private songTime: number | undefined;
  private worldScore: StaffWorldSource | undefined;
  private energyDeltaSeconds: number | undefined;
  private pianist: Pianist | undefined;
  private pianistLoading = false;
  private pianistStage: ThreeStage | undefined;
  private pianistIdentity: string | undefined;
  private pianistGeneration = 0;
  private pianistAttempted = false;
  private pianistNativeOnlyAttempt = false;
  private frameHands: HandsSource | undefined;
  private readonly nativeContacts = new NativeKeyContacts();
  private readonly publicPerformer = new Keyboard88PerformerHost();
  /** Reserves the road's stage position while it is rendered separately. */
  private readonly placeholder = new Container();
  private readonly effects = new FlatSceneLayers();
  private readonly roadEffects = new FlatSceneLayers();

  constructor(
    private readonly app: Application,
    private readonly road: Container,
    private readonly keys: NativeKeyboardScene,
    private readonly keyboard: KeyboardLayer,
    private readonly hands: HandsLayer | undefined
  ) {}

  /** Settles once the keys are drawn by three, or once it is clear that they cannot be. */
  setEnabled(on: boolean, road = on): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.wanted = on;
    if (this.hands) this.hands.live = on;
    this.roadWanted = road;
    const loaded = on || road ? this.load() : Promise.resolve();
    this.sync();
    return loaded;
  }

  get handStatus(): "idle" | "loading" | "ready" | "error" {
    if (!this.wanted || !this.hands || (!this.hands.container.visible && !this.hands.pianist))
      return "idle";
    if (!this.stage) return this.loadFailed ? "error" : "loading";
    if (
      this.pianistIdentity !== "public" &&
      import.meta.env.DEV &&
      (this.hands.songPerformance || this.hands.pianist)
    )
      return this.pianist?.native
        ? "ready"
        : this.pianistAttempted && !this.pianistLoading
          ? "error"
          : "loading";
    return this.publicPerformer.status;
  }

  get on(): boolean {
    return this.active && this.wanted;
  }

  /** The native road is independent of keyboard visibility and keyboard style. */
  setRoadEnabled(on: boolean): Promise<void> {
    this.roadWanted = on;
    const loaded = on ? this.load() : Promise.resolve();
    this.sync();
    return loaded;
  }

  get drawsRoad(): boolean {
    return this.active && this.roadWanted && this.road.visible && this.keys.scene !== undefined;
  }

  setEnergy(sources: readonly EnergySource[], deltaSeconds?: number): void {
    this.energy = sources;
    this.energyDeltaSeconds = deltaSeconds;
  }

  setEffects(options: FlatEffectOptions): void {
    this.effectOptions = options;
  }

  setWorldScoreSource(source: StaffWorldSource | undefined): void {
    this.worldScore = source;
    this.stage?.setWorldScoreSource(source);
  }

  setSongTime(time: number): void {
    this.songTime = time;
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

  private movementWanted = false;
  setFreeCameraMovement(on: boolean): void {
    this.movementWanted = on;
    this.stage?.setFreeCameraMovement(on);
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
    return this.sceneVisible && (this.freeActive || this.performanceWanted);
  }

  private get sceneVisible(): boolean {
    return (
      this.drawsRoad || (this.on && this.keys.container.visible && this.keys.scene !== undefined)
    );
  }

  resetFreeCamera(): void {
    this.stage?.resetFreeCamera();
  }

  freeKeysPointAt(x: number, y: number): { x: number; y: number; pitch?: number } | undefined {
    const scene = this.keys.scene;
    if (!this.active || !scene) return undefined;
    const surface = scene.faces[0]?.key.pitch === 0 ? new Vector2() : undefined;
    const pitch = this.stage?.freeKeyAt(
      x,
      y,
      this.app.screen.width,
      this.app.screen.height,
      surface
    );
    if (pitch === 0 && surface)
      return { x: surface.x * scene.texture.width, y: surface.y * scene.texture.height };
    const face = scene.faces.find(({ key }) => key.pitch === pitch);
    if (face)
      return { x: face.key.x + face.key.width / 2, y: face.source.y + face.source.height / 2 };
    if (pitch === undefined || scene.camera.params.keyboardDepth === undefined) return undefined;
    const c4 = metricC4X(
      scene.faces.map(({ key }) => key),
      scene.camera.sourceX
    );
    const source =
      (c4 + metricKeyX(pitch)) / (scene.camera.params.sourceUnits ?? 0.5) +
      scene.camera.params.width / 2;
    return { x: source, y: 1, pitch };
  }

  private syncFreeCamera(layered = this.active): void {
    const on =
      this.freeWanted &&
      !this.performanceWanted &&
      this.active &&
      this.wanted &&
      this.keys.container.visible &&
      layered;
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
    this.roadWanted = false;
    void this.setEnabled(false);
    this.destroyed = true;
    this.clearEnergy();
    this.pianistGeneration++;
    this.releasePianist();
    this.publicPerformer.dispose();
    this.effects.dispose();
    this.roadEffects.dispose();
    this.stage?.dispose();
    this.stage = undefined;
  }

  private load(): Promise<void> {
    if (this.stage) return Promise.resolve();
    this.loading ??= this.create();
    return this.loading;
  }

  private async create(): Promise<void> {
    this.loadFailed = false;
    try {
      const [{ ThreeStage }, { loadKeyboard88 }] = await Promise.all([
        import("./ThreeStage"),
        import("./keyboard88")
      ]);
      const kit = await loadKeyboard88();
      if (this.destroyed) {
        kit.dispose();
        return;
      }
      try {
        this.stage = new ThreeStage(this.app.renderer.threeRenderer, kit);
        this.stage.beforeRender = this.beforeRender;
        this.stage.setKeyboardDim(this.keyboardDim);
        if (this.worldScore) this.stage.setWorldScoreSource(this.worldScore);
        this.stage.setFreeCameraMovement(this.movementWanted);
        this.stage.setPerformanceScene(this.performanceWanted);
      } catch (error) {
        kit.dispose();
        throw error;
      }
    } catch (error) {
      this.loadFailed = true;
      console.warn("3D keys unavailable, native scene unavailable", error);
    } finally {
      this.loading = undefined;
      if (!this.destroyed) this.sync();
    }
  }

  private sync(): void {
    const on = (this.wanted || this.roadWanted) && this.stage !== undefined;
    if (this.hands) this.hands.live = this.wanted;
    if (on === this.active) return;
    this.active = on;
    this.syncFreeCamera();
    const { ticker } = this.app;
    const render = this.app.render;
    if (on) {
      ticker.remove(render, this.app);
      ticker.add(this.frame, undefined, UPDATE_PRIORITY.LOW);
    } else {
      this.publicPerformer.clear();
      ticker.remove(this.frame);
      ticker.add(render, this.app, UPDATE_PRIORITY.LOW);
      this.layer(false);
    }
  }

  private readonly frame = (): void => {
    const { renderer, stage } = this.app;
    const scene = this.keys.scene;
    const layered =
      this.stage !== undefined &&
      scene &&
      (this.road.visible || (this.wanted && this.keys.container.visible));
    this.layer(Boolean(layered));
    this.syncFreeCamera(Boolean(layered));
    if (!layered || !this.stage) {
      renderer.render({ container: stage });
      return;
    }
    const separateRoad = this.freeActive || this.performanceWanted;
    const worldEffects = separateRoad && this.stage.nativeEffectsReady;
    const legacyEffects = !this.freeActive && !worldEffects;
    renderer.render({
      container: separateRoad || !this.road.visible ? this.placeholder : this.road,
      ...(separateRoad ? { clearColor: 0x000000 } : {})
    });
    try {
      if (separateRoad) this.roadEffects.draw(renderer, legacyEffects);
      this.effects.draw(renderer, legacyEffects && separateRoad);
      if (this.wanted) this.seatPianist(this.stage, scene);
      else if (this.hands) this.hands.live = false;
      const picture = scene.texture.nativeTexture;
      const frame = this.keyboard.frame;
      const hands =
        this.wanted && this.hands && (this.hands.container.visible || this.hands.pianist)
          ? {
              time: this.hands.time,
              notes: this.hands.songNotes,
              beats: this.hands.songBeats,
              performance: this.hands.songPerformance
            }
          : undefined;
      this.frameHands = hands;
      // Physical contacts do not depend on whether hands are shown or loaded.
      this.nativeContacts.setNotes(this.hands?.songNotes);
      const contactTime = this.hands?.time ?? this.songTime ?? frame?.hintTime ?? 0;
      this.stage.setSongStage(this.hands?.songStage);
      this.stage.draw(
        scene,
        picture,
        (pitch) =>
          frame?.pressed.has(pitch) === true ||
          (frame?.physicalDown?.has(pitch) ??
            (frame?.sounding.has(pitch) === true &&
              (!this.nativeContacts.has(pitch) || this.nativeContacts.down(pitch, contactTime)))),
        this.app.screen,
        this.app.ticker.deltaMS / 1000,
        hands,
        this.energy,
        this.energyDeltaSeconds,
        this.drawsRoad ? this.roadFrame : undefined,
        worldEffects,
        this.hands?.songNotes,
        separateRoad ? undefined : this.drawRoadEffects,
        this.wanted && this.keys.container.visible,
        this.effectOptions,
        this.songTime ?? this.roadFrame?.songTime ?? hands?.time ?? 0
      );
    } catch (error) {
      this.effects.restore();
      this.roadEffects.restore();
      console.warn("3D keys failed, native scene unavailable", error);
      // Restore the road, keys, sprite hands and normal ticker before drawing this frame again.
      this.roadWanted = false;
      void this.setEnabled(false);
      this.stage.dispose();
      this.stage = undefined;
      renderer.render({ container: stage });
      return;
    }
    try {
      renderer.render({ container: stage, clear: false });
    } finally {
      this.effects.restore();
      this.roadEffects.restore();
    }
  };

  private readonly drawRoadEffects = (): void => {
    this.effects.restore();
    this.effects.draw(this.app.renderer);
  };

  private readonly beforeRender = (camera: Camera, separateCameras = false): void => {
    if (this.publicPerformer.ready) {
      this.publicPerformer.pose(this.frameHands, separateCameras);
      return;
    }
    if (!this.wantsPianist() || !this.pianist) return;
    if (this.pianist.native) this.pianist.sample(this.frameHands, camera);
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

  private wantsPianist(): boolean {
    return (
      this.hands?.pianist === true ||
      (this.hands?.container.visible === true && this.hands.songPerformance !== undefined)
    );
  }

  /** A restored source package supersedes a previously loaded unrelated trial, including pending loads. */
  private seatPianist(stage: ThreeStage, keys: KeysScene): void {
    const source = this.hands?.songPerformance;
    if (this.hands && !(import.meta.env.DEV && (source || this.hands.pianist))) {
      if (this.pianistIdentity !== "public") {
        this.pianistGeneration++;
        this.pianistLoading = this.pianistAttempted = false;
        this.releasePianist();
        this.pianistIdentity = "public";
      }
      this.publicPerformer.sync(stage, keys, this.hands);
      this.hands.live = this.wanted;
      return;
    }
    this.publicPerformer.clear();
    const identity = this.sourceIdentity();
    if (identity !== this.pianistIdentity) {
      this.pianistIdentity = identity;
      this.pianistGeneration++;
      this.pianistLoading = false;
      this.pianistAttempted = false;
      this.releasePianist();
    }
    const bodyWanted = this.hands?.pianist === true;
    const wanted = this.wantsPianist();
    // A hands-only attempt never loads the unrelated trial; enabling the body may try it later.
    if (bodyWanted && this.pianistNativeOnlyAttempt && !this.pianistLoading && !this.pianist) {
      this.pianistAttempted = false;
      this.pianistNativeOnlyAttempt = false;
    }
    if (wanted && !this.pianist && !this.pianistLoading && !this.pianistAttempted) {
      this.pianistLoading = this.pianistAttempted = true;
      this.pianistNativeOnlyAttempt = !bodyWanted;
      const generation = this.pianistGeneration;
      void import("./pianist")
        .then(async ({ Pianist, loadPianist }) => {
          const model = bodyWanted ? await loadPianist(source) : await loadPianist(source, true);
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
    if (this.hands) this.hands.live = this.wanted;
    pianist?.rig?.setNativeHandsVisible(false);
    if (!pianist) return;
    const visible = wanted && (bodyWanted || pianist.native);
    pianist.space.visible = visible;
    if (!visible) return;
    if (this.pianistStage !== stage) {
      stage.addToKeys(pianist.space);
      this.pianistStage = stage;
    }
    const camera = keys.keyboardCamera ?? keys.roadCamera ?? keys.camera;
    pianist.setTopView(
      !this.freeActive && !this.performanceWanted && camera.params.prefs.pitch === 90
    );
    pianist.setBodyVisible(bodyWanted);
    pianist.follow(keys);
  }

  /** The road off the stage, drawn first, and native keys in the flat keys' place; or back. */
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
