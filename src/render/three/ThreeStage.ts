import { StageWorldScore } from "./StageWorldScore";
import { StylizedProjectionLayer } from "./StylizedProjectionLayer";
import { pickKeyboardKey } from "./pickKeyboardKey";
import { configureStageCamera } from "./configureStageCamera";
import { buildKeyboardMesh } from "./buildKeyboardMesh";
import type { StaffWorldSource } from "../../staff/staffWorldSnapshot";
import { prepareRoadProjection, prepareFreeRoadBounds } from "./roadFrameProjection";
import { drawRoadNoteAppearance } from "./drawRoadNoteAppearance";
import type { ThreeFlatRoadNotes } from "./ThreeFlatRoadNotes";
import {
  Camera,
  ColorManagement,
  DirectionalLight,
  Texture,
  Group,
  HemisphereLight,
  MeshStandardMaterial,
  Scene,
  Raycaster,
  Vector2
} from "three";
import type { WebGLRenderer, Mesh } from "three";
import type { Object3D } from "three";
import type { KeysScene } from "../NativeKeyboardScene";
import type { SongStage } from "../../song/songStage";
import type { EnergySource } from "../noteEnergy";
import { ALL_FLAT_EFFECTS, type FlatEffectOptions } from "../flatEffectSettings";
import { keyBoxes } from "./keyBoxes";
import { keyboardSceneBoxes } from "./computerKeyboardSlab";
import { PianoCase } from "./PianoCase";
import type { KeyBox } from "./keyBoxes";
import { IVORY, ivoryMaterial, velvetMaterial } from "./keyMaterials";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_DIP, metricKeyX } from "../keyboardMetrics";
import type { HandsSource } from "./liveHands";
import { ThreeNoteLights } from "./ThreeNoteLights";
import { ThreeKeyEmission } from "./ThreeKeyEmission";
import { KeyboardAppearance } from "./KeyboardAppearance";
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
import { invalidateKeyboardCasePasses } from "./keyboardCasePasses";

// Baked colours and the keys' texture are display values: keep three in the same space.
ColorManagement.enabled = false;

/** How fast a key follows the finger, per second. */
const DIP_RATE = 30;
const NO_EFFECTS: FlatEffectOptions = { burning: false, presses: false, musicalNotes: false };

interface Hinged {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
}

/** The keyboard drawn by three.js using the shared Three renderer. */
export class ThreeStage {
  private readonly free: FreeSceneCamera;
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
  /** The baked picture of the flat keys: colours, lights and stickers for the top faces. */
  private picture = new Texture();
  /** The painted keys tinted ivory, as the kit is: their colours and stickers stay readable. */
  private readonly top = new MeshStandardMaterial({
    map: this.picture,
    color: IVORY,
    roughness: 0.4
  });
  private readonly white = ivoryMaterial();
  private readonly black = velvetMaterial();
  private readonly case = new MeshStandardMaterial({ color: 0x1c1d24, roughness: 0.3 });
  private readonly felt = new MeshStandardMaterial({ color: 0x951f2c, roughness: 0.95 });
  /** The case around the keys: rails, cheeks and the back panel. */
  private readonly body = new Group();
  private readonly cabinet: PianoCase;
  private pickCamera: Camera | undefined;
  private hinged: Hinged[] = [];
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
    this.scorePoster = new StageWorldScore(renderer, this.scene, this.keys, this.free);
    this.cabinet = new PianoCase(keyboard);
    this.performance = new PerformanceScene(this.scene);
    this.worldStage = new PerformanceWorldStage(this.scene);
    this.roadCamera.matrixAutoUpdate = false;
    this.keyboardCamera.matrixAutoUpdate = false;
    this.top.vertexColors = true;
    this.black.vertexColors = true;
    const sun = new DirectionalLight(0xffffff, 0.45);
    // Above and in front of the keys, a little to the left: the rounded edges read on both sides.
    sun.position.set(-150, 900, 900);
    const hemisphere = new HemisphereLight(0xffffff, 0x9a9fac, 0.25);
    this.appearance = new KeyboardAppearance({
      top: this.top,
      white: this.white,
      black: this.black,
      sun,
      hemisphere,
      refresh: () => {
        this.keyEmission.refreshAppearance();
      }
    });
    this.baseLighting.add(hemisphere, sun);
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
    this.top.map = picture;
    if (nativeKeyboard && (keys.version !== this.version || changedTexture)) this.build(keys);
    else if (!nativeKeyboard && keys.version !== this.roadVersion) {
      this.roadBoxes = keyBoxes(keys);
      this.roadVersion = keys.version;
    }
    const roadCamera = keys.roadCamera ?? keys.camera;
    const keyboardCamera = keys.keyboardCamera ?? roadCamera;
    const { params } = roadCamera;
    const scale = params.prefs.scale;
    this.keys.scale.setScalar(scale);
    this.keys.position.x =
      this.freeEnabled || this.performanceEnabled
        ? 0
        : -keys.pan * (params.sourceUnits ?? 0.5) * scale;
    this.road.scale.copy(this.keys.scale);
    this.road.position.copy(this.keys.position);
    this.lighting.scale.copy(this.keys.scale);
    this.lighting.position.copy(this.keys.position);
    this.road.visible = roadFrame !== undefined;
    this.roadNotes.setViewport(screen.width, screen.height);
    const sceneEnabled = this.performanceEnabled || this.freeEnabled;
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
    this.noteLights.update(energy, roadCamera, energyDeltaSeconds);
    this.keyEmission.update(energy, energyDeltaSeconds);
    for (const { pitch, hinge } of this.hinged) {
      const target = down(pitch) ? -KEYBOARD_DIP : 0;
      hinge.position.y += (target - hinge.position.y) * step;
    }
    const inspecting = this.freeEnabled && !this.performanceEnabled;
    this.scorePoster.draw(keys, this.boxes, inspecting, roadFrame);
    prepareFreeRoadBounds(this.free, this.road, roadFrame, inspecting);
    const detached = keys.offset.x !== 0 || keys.offset.y !== 0;
    const separate =
      !this.performanceEnabled && !this.freeEnabled && (detached || keyboardCamera !== roadCamera);
    if (!this.performanceEnabled && this.freeEnabled)
      this.free.update(screen.width, screen.height, this.keys, deltaSeconds);
    else {
      this.configureCamera(this.roadCamera, roadCamera, screen);
      if (separate) this.configureCamera(this.keyboardCamera, keyboardCamera, screen, keys.offset);
    }
    const camera = this.performanceEnabled
      ? this.performance.camera
      : this.freeEnabled
        ? this.free.camera
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
    if (this.freeEnabled && !this.performanceEnabled)
      this.performance.updateInspection(songTime, this.keys, camera);
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
      this.projectionGeometryOnly ? NO_EFFECTS : effects
    );
    prepareRoadProjection(
      this.roadGuides,
      this.roadBoxes,
      roadCamera,
      roadFrame,
      this.performanceEnabled ? "performance" : inspecting ? "free" : "standard"
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
        this.projection?.requested || (!this.freeEnabled && !this.performanceEnabled && roadEffects)
          ? () => {
              try {
                this.projection?.draw(this.renderer);
                if (!this.freeEnabled && !this.performanceEnabled) roadEffects?.();
              } finally {
                // The flat pass changes camera state; rebind before the depth-only pass.
                this.renderer.resetState();
                this.renderer.setViewport(0, 0, screen.width, screen.height);
              }
            }
          : undefined
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
  suspendProjection = (): void => this.projection?.suspend();

  get nativeEffectsReady(): boolean {
    return (this.performanceEnabled || this.freeEnabled) && this.worldStage.ready;
  }

  setFreeCamera(on: boolean): void {
    if (on !== this.freeEnabled) {
      this.performance.invalidate();
      this.worldStage.invalidate();
    }
    this.freeEnabled = on;
    this.syncSceneLighting();
    this.free.setEnabled(on && !this.performanceEnabled);
  }

  setPerformanceScene(on: boolean): void {
    if (on === this.performanceEnabled) return;
    this.performance.invalidate();
    this.worldStage.invalidate();
    this.performanceEnabled = on;
    this.syncSceneLighting();
    this.free.setEnabled(this.freeEnabled && !on);
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
    const camera = this.performanceEnabled
      ? this.performance.camera
      : this.freeEnabled
        ? this.free.camera
        : (this.pickCamera ?? this.roadCamera);
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
    invalidateKeyboardCasePasses(this.scene);
    this.keys.add(object);
    this.free.invalidate(false);
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  removeFromKeys(object: Object3D): void {
    invalidateKeyboardCasePasses(this.scene);
    object.removeFromParent();
    this.free.invalidate(false);
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  /** The song's performance-scene dressing: its neon sign and whether the bass sets the stage on fire. */
  setSongStage(stage: SongStage | undefined): void {
    if (stage?.sign !== this.sign) {
      this.sign = stage?.sign;
      invalidateKeyboardCasePasses(this.scene);
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
    this.white.map?.dispose();
    this.black.bumpMap?.dispose();
    for (const material of [this.top, this.white, this.black, this.case, this.felt])
      material.dispose();
    this.keyboard.dispose();
  }

  private build(keys: KeysScene): void {
    invalidateKeyboardCasePasses(this.scene);
    this.free.invalidate(false);
    this.clear(true);
    this.version = keys.version;
    const boxes = keyboardSceneBoxes(keys);
    this.boxes = boxes;
    this.roadBoxes = keyBoxes(keys);
    this.performance.layout(boxes);
    this.appearance.layout(boxes);
    this.noteLights.layout(boxes, keys.roadCamera ?? keys.camera);
    this.rimLights.layout(boxes, keys.camera.params.prefs.scale);
    for (const box of boxes) {
      const mesh = buildKeyboardMesh(box, this.keyboard, this.picture, this.keyEmission, {
        top: this.top,
        white: this.white
      });
      const hinge = new Group();
      hinge.add(mesh);
      this.keys.add(hinge);
      this.hinged.push({ pitch: box.pitch, hinge, mesh });
    }
    this.buildBody(boxes);
    this.keyEmission.endLayout();
  }

  /** The full case keeps the Blender scene's proportions when the camera changes range. */
  private buildBody(boxes: readonly KeyBox[]): void {
    const white = boxes.find((box) => !box.black);
    if (!white || white.pitch === 0) return;
    this.cabinet.layout(white.x - metricKeyX(white.pitch));
    this.body.add(this.cabinet.group);
  }

  private clear(preserveEnergy = false): void {
    for (const { hinge, mesh } of this.hinged) {
      mesh.geometry.dispose();
      this.keys.remove(hinge);
    }
    this.hinged = [];
    if (preserveEnergy) this.keyEmission.beginLayout();
    else this.keyEmission.dispose();
    // The case shares the kit's geometry: nothing of its own to free.
    this.cabinet.clear();
    this.body.clear();
  }
}
