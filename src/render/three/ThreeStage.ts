import type { CameraComposition } from "../cameraComposition";
import { configureDockedRoad, updateDockedKeyOffsets } from "./dockedRoadProjection";
import { DockedRoadLabels } from "./DockedRoadLabels";
import { invalidateDockedScenePasses } from "./dockedScenePasses";
import { StageWorldScore } from "./StageWorldScore";
import { StylizedProjectionLayer } from "./StylizedProjectionLayer";
import { pickKeyboardKey } from "./pickKeyboardKey";
import { configureStageCamera } from "./configureStageCamera";
import { buildStageKeys, clearStageKeys, type HingedKey } from "./stageKeyboardLayout";
import type { StaffWorldSource } from "../../staff/staffWorldSnapshot";
import { prepareRoadProjection, prepareFreeRoadBounds } from "./roadFrameProjection";
import { drawRoadNoteAppearance } from "./drawRoadNoteAppearance";
import type { ThreeFlatRoadNotes } from "./ThreeFlatRoadNotes";
import { Camera, ColorManagement, Texture, Group, Scene, Raycaster, Vector2 } from "three";
import type { WebGLRenderer } from "three";
import type { Object3D } from "three";
import type { KeysScene } from "../NativeKeyboardScene";
import type { SongStage } from "../../song/songStage";
import type { EnergySource } from "../noteEnergy";
import { ALL_FLAT_EFFECTS, type FlatEffectOptions } from "../flatEffectSettings";
import { keyBoxes } from "./keyBoxes";
import { keyboardSceneBoxes } from "./computerKeyboardSlab";
import { PianoCase } from "./PianoCase";
import type { KeyBox } from "./keyBoxes";
import { StageKeyMaterials } from "./StageKeyMaterials";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_DIP } from "../keyboardMetrics";
import type { HandsSource } from "./liveHands";
import { ThreeNoteLights } from "./ThreeNoteLights";
import { ThreeKeyEmission } from "./ThreeKeyEmission";
import type { KeyboardAppearance } from "./KeyboardAppearance";
import { ThreeRimLights } from "./ThreeRimLights";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { ThreeRoadTrails } from "./ThreeRoadTrails";
import { ThreeNoteAura } from "./ThreeNoteAura";
import { ThreeRoadGuides } from "./ThreeRoadGuides";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { drawSceneCameraPasses } from "./sceneCameraPasses";
import { PerformanceWorldStage } from "./PerformanceWorldStage";
import { PerformanceScene } from "./PerformanceScene";
import { FreeSceneCamera } from "./FreeSceneCamera";
import { keysGroupScale, placeStageGroups } from "./stageGroupFrames";

// Baked colours and the keys' texture are display values: keep three in the same space.
ColorManagement.enabled = false;

/** How fast a key follows the finger, per second. */
const DIP_RATE = 30;
const NO_EFFECTS: FlatEffectOptions = { burning: false, presses: false, musicalNotes: false };

/** The keyboard drawn by three.js using the shared Three renderer. */
export class ThreeStage {
  private readonly free: FreeSceneCamera;
  private readonly game: FreeSceneCamera;
  private composition: CameraComposition = "standard";
  private dockedLabels: DockedRoadLabels | undefined;
  private freeEnabled = false;
  private performanceEnabled = false;
  private bassFire = false;
  private readonly performance: PerformanceScene;
  private readonly worldStage: PerformanceWorldStage;
  private readonly raycaster = new Raycaster();
  private readonly occluders: Object3D[] = [];
  private readonly pointer = new Vector2();
  private readonly scene = new Scene();
  private readonly roadCamera = new Camera();
  private readonly keyboardCamera = new Camera();
  private readonly keys = new Group();
  private readonly road = new Group();
  private readonly lighting = new Group();
  private readonly baseLighting = new Group();
  private baseLightingVisible = true;
  private readonly roadNotes = new ThreeRoadNotes();
  private flatRoadNotes: ThreeFlatRoadNotes | undefined;
  private readonly roadTrails = new ThreeRoadTrails();
  private readonly noteAura = new ThreeNoteAura();
  private readonly roadGuides = new ThreeRoadGuides();
  private boxes: readonly KeyBox[] = [];
  /** The song's range only: the road and its guides stay as wide as the song, not all 88 keys. */
  private roadBoxes: readonly KeyBox[] = [];
  private roadVersion = -1;
  private readonly noteLights = new ThreeNoteLights();
  private readonly keyEmission = new ThreeKeyEmission();
  private readonly appearance: KeyboardAppearance;
  private readonly rimLights = new ThreeRimLights();
  private picture = new Texture();
  private readonly materials = new StageKeyMaterials((dim) => {
    this.keyEmission.setDim(dim);
  });
  /** The case around the keys: rails, cheeks and the back panel. */
  private readonly body = new Group();
  private readonly cabinet: PianoCase;
  private pickCamera: Camera | undefined;
  private hinged: HingedKey[] = [];
  private version = -1;
  private disposed = false;
  private readonly scorePoster: StageWorldScore;
  private projection: StylizedProjectionLayer | undefined;
  private sign: string | undefined;
  /** Pose the character after this frame's camera setup and before any scene render pass. */
  beforeRender: ((camera: Camera, separateCameras: boolean) => void) | undefined;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly keyboard: Keyboard88
  ) {
    this.free = new FreeSceneCamera(renderer.domElement);
    this.game = new FreeSceneCamera(renderer.domElement, true);
    this.scorePoster = new StageWorldScore(renderer, this.scene, this.keys, this.free);
    this.cabinet = new PianoCase(keyboard);
    this.performance = new PerformanceScene(this.scene);
    this.worldStage = new PerformanceWorldStage(this.scene);
    this.roadCamera.matrixAutoUpdate = false;
    this.keyboardCamera.matrixAutoUpdate = false;
    this.appearance = this.materials.appearance;
    this.baseLighting.add(this.materials.lighting);
    this.scene.add(this.baseLighting, this.road, this.keys, this.lighting);
    this.road.add(
      this.roadGuides.group,
      this.roadTrails.group,
      this.roadNotes.group,
      this.noteAura.group
    );
    this.keys.add(this.body, this.appearance.group);
    this.lighting.add(this.noteLights.group, this.rimLights.group);
    this.occluders.push(this.body);
  }

  /** Draws the keys over whatever is in the frame now, keeping it: the road under them. */
  draw(
    keys: KeysScene,
    picture: Texture,
    down: (pitch: number) => boolean,
    screen: { readonly width: number; readonly height: number },
    deltaSeconds: number,
    hands: HandsSource | undefined,
    energy: readonly EnergySource[] = [],
    energyDeltaSeconds = deltaSeconds,
    roadFrame?: ThreeRoadFrame,
    worldEffects = false,
    songNotes?: HandsSource["notes"],
    roadEffects?: () => void,
    nativeKeyboard = true,
    effects: FlatEffectOptions = ALL_FLAT_EFFECTS,
    songTime = roadFrame?.songTime ?? hands?.time ?? 0
  ): void {
    this.keys.visible = nativeKeyboard;
    this.lighting.visible = nativeKeyboard;
    const changedTexture = this.picture !== picture;
    this.picture = picture;
    this.materials.top.map = picture;
    if (nativeKeyboard && (keys.version !== this.version || changedTexture)) this.build(keys);
    else if (!nativeKeyboard && keys.version !== this.roadVersion) {
      this.roadBoxes = keyBoxes(keys);
      this.roadVersion = keys.version;
    }
    const roadCamera = keys.roadCamera ?? keys.camera;
    const keyboardCamera = keys.keyboardCamera ?? roadCamera;
    placeStageGroups(
      this.keys,
      this.road,
      keyboardCamera,
      roadCamera,
      keys.pan,
      this.freeEnabled || this.performanceEnabled,
      this.performanceEnabled
    );
    this.lighting.scale.copy(this.keys.scale);
    this.lighting.position.copy(this.keys.position);
    this.road.visible = roadFrame !== undefined;
    this.roadNotes.setViewport(screen.width, screen.height);
    // Every world view outside the staging draws the world and the keys with separate cameras.
    const docked =
      !this.performanceEnabled && (this.composition !== "standard" || this.freeEnabled);
    const sceneEnabled = this.performanceEnabled || this.freeEnabled || docked;
    const effectBoxes = nativeKeyboard ? this.boxes : this.roadBoxes;
    if (sceneEnabled) {
      this.worldStage.prepare(this.keys, effectBoxes, roadCamera.near.z);
      this.performance.lights.setStageLayout(this.worldStage.stage);
    }
    this.performance.setNotes(songNotes ?? hands?.notes);
    this.worldStage.setBassNotes(this.bassFire ? (songNotes ?? hands?.notes) : undefined);
    this.performance.setRoad(roadFrame, roadCamera.near.y, roadCamera.near.z, roadCamera.roadFarZ);
    const angle = this.performanceEnabled
      ? this.performance.update(songTime, screen.width, screen.height, this.keys)
      : 0;
    this.roadNotes.performanceAngle =
      this.roadTrails.performanceAngle =
      this.noteAura.performanceAngle =
        angle;
    this.roadNotes.performanceScale =
      this.roadTrails.performanceScale =
      this.noteAura.performanceScale =
        this.performanceEnabled ? this.performance.roadScale : 1;
    this.roadNotes.nearZ = this.roadTrails.nearZ = this.noteAura.nearZ = roadCamera.near.z;
    if (roadFrame) {
      this.noteAura.update(
        roadFrame.notes,
        roadCamera.near.y,
        roadFrame.visualTime,
        roadFrame.noteCount
      );
      this.roadTrails.update(
        roadFrame.notes,
        roadCamera.near.y,
        roadFrame.visualTime,
        roadFrame.noteCount,
        (roadCamera.roadFarZ - roadCamera.near.z) * 0.22,
        roadFrame.trailAnchors,
        roadFrame.trailAnchorCount
      );
      this.noteAura.group.visible =
        effects.burning && !roadFrame.flatMaterial && roadFrame.noteStyle === "glass";
      this.roadTrails.group.visible = effects.burning;
      this.flatRoadNotes = drawRoadNoteAppearance(
        this.roadNotes,
        this.flatRoadNotes,
        this.road,
        roadFrame,
        roadCamera.near.y,
        roadCamera.near.z
      );
    }
    const step = Math.min(1, deltaSeconds * DIP_RATE);
    this.noteLights.update(energy, roadCamera, energyDeltaSeconds, this.keys.scale.x);
    this.keyEmission.update(energy, energyDeltaSeconds);
    for (const { pitch, hinge } of this.hinged) {
      const target = down(pitch) ? -KEYBOARD_DIP : 0;
      hinge.position.y += (target - hinge.position.y) * step;
    }
    updateDockedKeyOffsets(this.hinged);
    const inspecting = (this.freeEnabled || docked) && !this.performanceEnabled;
    const worldView = docked && this.composition === "game" ? this.game : this.free;
    this.scorePoster.draw(keys, this.boxes, inspecting, roadFrame, worldView);
    prepareFreeRoadBounds(worldView, this.road, roadFrame, inspecting);
    const separate = !this.performanceEnabled;
    if (inspecting) {
      worldView.update(screen.width, screen.height, this.keys, deltaSeconds);
      if (docked) this.configureCamera(this.keyboardCamera, keyboardCamera, screen, keys.offset);
    } else {
      this.configureCamera(this.roadCamera, roadCamera, screen);
      if (separate) this.configureCamera(this.keyboardCamera, keyboardCamera, screen, keys.offset);
    }
    const camera = this.performanceEnabled
      ? this.performance.camera
      : inspecting
        ? worldView.camera
        : this.roadCamera;
    this.pickCamera = separate ? this.keyboardCamera : camera;
    this.beforeRender?.(this.pickCamera, separate);
    if (roadFrame?.noteProjection.mode === "stylizedProjection")
      this.projection ??= new StylizedProjectionLayer();
    const projected =
      this.projection?.prepare(
        roadFrame,
        this.boxes,
        this.hinged,
        this.pickCamera,
        screen,
        roadCamera,
        nativeKeyboard && !this.performanceEnabled
      ) ?? false;
    // The near quarter of every separate view joins the displayed keys, also on the legacy road.
    const roadDock = separate && !projected;
    if (inspecting) this.performance.updateInspection(songTime, this.keys, camera);
    this.worldStage.setDuration(this.performance.getDuration());
    this.worldStage.update(
      sceneEnabled,
      songTime,
      this.keys,
      effectBoxes,
      energy,
      camera,
      roadCamera.near.z,
      worldEffects,
      roadFrame,
      this.freeEnabled && !this.performanceEnabled,
      this.projectionGeometryOnly ? NO_EFFECTS : effects,
      docked ? this.keyboardCamera : undefined
    );
    this.roadGuides.setDocked(roadDock);
    prepareRoadProjection(
      this.roadGuides,
      this.roadBoxes,
      roadCamera,
      roadFrame,
      this.performanceEnabled ? "performance" : inspecting ? "free" : "standard"
    );
    configureDockedRoad(
      this.road,
      camera,
      this.keyboardCamera,
      roadDock,
      roadCamera.near.z,
      roadCamera.roadFarZ,
      this.keys,
      // Straightening belongs to the standard road only; world views keep their plain bend.
      !inspecting && { ...keys, screen }
    );
    // Standard keeps the overlay labels: they already follow the dock through notePlace.
    if (roadDock && docked) this.dockedLabels ??= new DockedRoadLabels();
    this.dockedLabels?.prepare(
      roadFrame,
      roadCamera,
      this.road,
      camera,
      this.keyboardCamera,
      screen,
      roadDock && docked,
      inspecting,
      this.keys
    );
    if (projected) this.road.visible = false;
    this.renderer.resetState();
    try {
      this.renderer.setViewport(0, 0, screen.width, screen.height);
      this.renderer.clearDepth();
      this.projection?.drawBackground(this.renderer);
      drawSceneCameraPasses(
        this.renderer,
        this.scene,
        this.road,
        this.keys,
        camera,
        this.keyboardCamera,
        separate,
        // Free and performance cameras see one world: plain depth, no road-over-case passes.
        (this.freeEnabled && !projected) || this.performanceEnabled
          ? undefined
          : nativeKeyboard
            ? this.body
            : undefined,
        this.projection?.requested ||
          roadDock ||
          (!this.freeEnabled && !this.performanceEnabled && roadEffects)
          ? () => {
              try {
                this.projection?.draw(this.renderer);
                this.dockedLabels?.draw(this.renderer);
                if (!this.freeEnabled && !this.performanceEnabled) roadEffects?.();
              } finally {
                // The flat pass changes camera state; rebind before the depth-only pass.
                this.renderer.resetState();
                this.renderer.setViewport(0, 0, screen.width, screen.height);
              }
            }
          : undefined,
        docked
      );
    } finally {
      // Return GL defaults even if a pass failed; the host can draw the flat scene safely.
      this.renderer.resetState();
    }
  }

  private readonly configureCamera = configureStageCamera;
  get projectionGeometryOnly(): boolean {
    return this.projection?.geometryOnly ?? false;
  }
  suspendProjection = (): void => {
    this.projection?.suspend();
    this.dockedLabels?.suspend();
  };

  get nativeEffectsReady(): boolean {
    const world = this.performanceEnabled || this.freeEnabled || this.composition !== "standard";
    return world && this.worldStage.ready;
  }

  setCameraComposition(mode: CameraComposition): void {
    if (mode !== this.composition) invalidateDockedScenePasses(this.scene);
    this.composition = mode;
    this.free.setEnabled(this.freeEnabled && mode !== "game" && !this.performanceEnabled);
  }

  setWorldFov(fov: number): void {
    this.free.setFov(fov);
    this.game.setFov(fov);
  }

  setFreeCamera(on: boolean): void {
    if (on !== this.freeEnabled) {
      this.performance.invalidate();
      this.worldStage.invalidate();
    }
    this.freeEnabled = on;
    this.syncSceneLighting();
    this.free.setEnabled(on && !this.performanceEnabled && this.composition !== "game");
  }

  setPerformanceScene(on: boolean): void {
    if (on === this.performanceEnabled) return;
    this.performance.invalidate();
    this.worldStage.invalidate();
    this.performanceEnabled = on;
    this.syncSceneLighting();
    this.free.setEnabled(this.freeEnabled && !on && this.composition !== "game");
  }

  private syncSceneLighting(): void {
    const on = this.performanceEnabled || this.freeEnabled;
    if (on && !this.performance.lights.group.visible)
      this.baseLightingVisible = this.baseLighting.visible;
    this.baseLighting.visible = on ? false : this.baseLightingVisible;
    this.performance.lights.group.visible = on;
  }

  resetFreeCamera(): void {
    this.free.invalidate();
    this.game.invalidate();
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  setFreeCameraMovement(on: boolean): void {
    this.free.setMovement(on);
  }

  /** Actual mesh hits share the effective camera and the keys' current parallel travel. */
  freeKeyAt(
    x: number,
    y: number,
    width: number,
    height: number,
    surface?: Vector2
  ): number | undefined {
    const camera = this.pickCamera ?? this.roadCamera;
    return pickKeyboardKey(
      this.raycaster,
      this.pointer,
      this.scene,
      this.hinged,
      this.occluders,
      camera,
      x,
      y,
      width,
      height,
      surface
    );
  }

  /** Something of the host's that rides with the keys: the local pianist. */
  addToKeys(object: Object3D): void {
    invalidateDockedScenePasses(this.scene);
    this.keys.add(object);
    this.free.invalidate(false);
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  removeFromKeys(object: Object3D): void {
    invalidateDockedScenePasses(this.scene);
    object.removeFromParent();
    this.free.invalidate(false);
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  /** The song's performance-scene dressing: its neon sign and whether the bass sets the stage on fire. */
  setSongStage(stage: SongStage | undefined): void {
    if (stage?.sign !== this.sign) {
      this.sign = stage?.sign;
      invalidateDockedScenePasses(this.scene);
    }
    this.worldStage.setSign(stage?.sign);
    this.bassFire = stage?.bassFire === true;
  }

  clearEnergy(): void {
    this.noteLights.clear();
    this.worldStage.clear();
    this.keyEmission.clear();
  }

  setWorldScoreSource(source: StaffWorldSource | undefined): void {
    this.scorePoster.setSource(source);
  }

  setKeyboardDim(on: boolean): void {
    this.appearance.setDim(on);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beforeRender = undefined;
    this.free.dispose();
    this.game.dispose();
    this.dockedLabels?.dispose();
    this.scorePoster.dispose();
    this.projection?.dispose();
    this.performance.dispose();
    this.worldStage.dispose();
    this.clear();
    this.appearance.dispose();
    this.cabinet.dispose();
    this.noteLights.dispose();
    this.rimLights.dispose();
    this.roadNotes.dispose();
    this.flatRoadNotes?.dispose();
    this.roadTrails.dispose();
    this.noteAura.dispose();
    this.roadGuides.dispose();
    this.materials.dispose();
    this.keyboard.dispose();
  }

  private build(keys: KeysScene): void {
    invalidateDockedScenePasses(this.scene);
    this.free.invalidate(false);
    this.clear(true);
    this.version = keys.version;
    const boxes = keyboardSceneBoxes(keys);
    this.boxes = boxes;
    this.roadBoxes = keyBoxes(keys);
    this.performance.layout(boxes);
    this.appearance.layout(boxes);
    // Both light rigs sit in the keys group, scaled by the keyboard camera.
    this.noteLights.layout(boxes, keys.roadCamera ?? keys.camera, keysGroupScale(keys));
    this.rimLights.layout(boxes, keysGroupScale(keys));
    this.hinged = buildStageKeys(
      this.keys,
      boxes,
      this.keyboard,
      this.picture,
      this.keyEmission,
      this.materials,
      this.cabinet,
      this.body
    );
    this.keyEmission.endLayout();
  }

  private clear(preserveEnergy = false): void {
    clearStageKeys(this.keys, this.hinged, this.cabinet, this.body);
    this.hinged = [];
    if (preserveEnergy) this.keyEmission.beginLayout();
    else this.keyEmission.dispose();
  }
}
