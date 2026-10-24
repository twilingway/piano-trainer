import {
  Camera,
  ColorManagement,
  DirectionalLight,
  Texture,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Raycaster,
  Vector2,
  Vector3
} from "three";
import type { WebGLRenderer } from "three";
import type { Object3D } from "three";
import type { KeysScene } from "../NativeKeyboardScene";
import type { SongStage } from "../../song/songStage";
import type { EnergySource } from "../noteEnergy";
import { keyBoxes } from "./keyBoxes";
import { computerKeyboardSlabGeometry, keyboardSceneBoxes } from "./computerKeyboardSlab";
import { PianoCase } from "./PianoCase";
import type { KeyBox } from "./keyBoxes";
import { IVORY, ivoryMaterial, velvetMaterial } from "./keyMaterials";
import type { Keyboard88 } from "./keyboard88";
import { KEYBOARD_DIP, metricKeyX } from "../keyboardMetrics";
import { LiveHands } from "./liveHands";
import type { HandsSource } from "./liveHands";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import { ThreeNoteLights } from "./ThreeNoteLights";
import { ThreeKeyEmission } from "./ThreeKeyEmission";
import { KeyboardAppearance } from "./KeyboardAppearance";
import { keyboard88Geometry, paintedKeyboardTop } from "./keyboard88Geometry";
import { ThreeRimLights } from "./ThreeRimLights";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { ThreeRoadTrails } from "./ThreeRoadTrails";
import { ThreeNoteAura } from "./ThreeNoteAura";
import { ThreeRoadGuides } from "./ThreeRoadGuides";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";
import { drawSceneCameraPasses } from "./sceneCameraPasses";
import type { WorldCamera } from "../worldCamera";
import { PerformanceWorldStage } from "./PerformanceWorldStage";
import { PerformanceScene } from "./PerformanceScene";
import { FreeSceneCamera } from "./FreeSceneCamera";
import { invalidateKeyboardCasePasses } from "./keyboardCasePasses";

// Baked colours and the keys' texture are display values: keep three in the same space.
ColorManagement.enabled = false;

/** How fast a key follows the finger, per second. */
const DIP_RATE = 30;

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
  /** The live hands, once their model has loaded; without it the sprite hands stay. */
  readonly hands: LiveHands | undefined;
  private hinged: Hinged[] = [];
  private version = -1;
  private disposed = false;
  private nativePianist = false;
  private sign: string | undefined;
  /** Pose the character after this frame's camera setup and before any scene render pass. */
  beforeRender: ((camera: Camera, separateCameras: boolean) => void) | undefined;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly keyboard: Keyboard88,
    hand: Object3D | undefined
  ) {
    this.free = new FreeSceneCamera(renderer.domElement);
    this.cabinet = new PianoCase(keyboard);
    this.performance = new PerformanceScene(this.scene);
    this.worldStage = new PerformanceWorldStage(this.scene);
    this.hands = hand && new LiveHands(hand);
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
    if (this.hands) this.keys.add(this.hands.group);
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
    nativeKeyboard = true
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
    if (!this.nativePianist) this.hands?.update(nativeKeyboard ? hands : undefined);
    const sceneEnabled = this.performanceEnabled || this.freeEnabled;
    if (sceneEnabled) {
      this.worldStage.prepare(this.keys, this.boxes, roadCamera.near.z);
      this.performance.lights.setStageLayout(this.worldStage.stage);
    }
    this.performance.setNotes(songNotes ?? hands?.notes);
    this.worldStage.setBassNotes(this.bassFire ? (songNotes ?? hands?.notes) : undefined);
    this.performance.setRoad(roadFrame, roadCamera.near.y, roadCamera.near.z, roadCamera.roadFarZ);
    const angle = this.performanceEnabled
      ? this.performance.update(roadFrame?.songTime ?? 0, screen.width, screen.height, this.keys)
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
      this.noteAura.group.visible = this.roadTrails.group.visible =
        nativeKeyboard || roadFrame.burning;
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
      if (roadFrame.guides && !this.performanceEnabled)
        this.roadGuides.update(this.roadBoxes, roadCamera, roadFrame.beats, roadFrame.beatCount);
      else this.roadGuides.clear();
      this.roadNotes.update(
        roadFrame.notes,
        roadCamera.near.y,
        roadFrame.visualTime,
        roadFrame.noteCount
      );
    }
    const step = Math.min(1, deltaSeconds * DIP_RATE);
    this.noteLights.update(energy, roadCamera, energyDeltaSeconds);
    this.keyEmission.update(energy, energyDeltaSeconds);
    for (const { pitch, hinge } of this.hinged) {
      const press = this.nativePianist ? undefined : this.hands?.keys.get(pitch);
      const pressed = press ? Math.max(0, Math.min(KEYBOARD_DIP, press.drop)) : 0;
      const target = -Math.max(down(pitch) ? KEYBOARD_DIP : 0, pressed);
      hinge.position.y = press ? target : hinge.position.y + (target - hinge.position.y) * step;
    }
    const detached = keys.offset.x !== 0 || keys.offset.y !== 0;
    const separate =
      !this.performanceEnabled && !this.freeEnabled && (detached || keyboardCamera !== roadCamera);
    if (!this.performanceEnabled && this.freeEnabled)
      this.free.update(screen.width, screen.height, this.keys);
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
    if (this.freeEnabled && !this.performanceEnabled)
      this.performance.updateInspection(roadFrame?.songTime ?? 0, this.keys, camera);
    this.worldStage.setDuration(this.performance.getDuration());
    this.worldStage.update(
      sceneEnabled,
      roadFrame?.songTime ?? 0,
      this.keys,
      this.boxes,
      energy,
      camera,
      roadCamera.near.z,
      worldEffects,
      roadFrame,
      this.freeEnabled && !this.performanceEnabled
    );
    this.beforeRender?.(this.pickCamera, separate);
    this.renderer.resetState();
    try {
      this.renderer.setViewport(0, 0, screen.width, screen.height);
      this.renderer.clearDepth();
      drawSceneCameraPasses(
        this.renderer,
        this.scene,
        this.road,
        this.keys,
        camera,
        this.keyboardCamera,
        separate,
        // Free and performance cameras see one world: plain depth, no road-over-case passes.
        this.freeEnabled || this.performanceEnabled
          ? undefined
          : nativeKeyboard
            ? this.body
            : undefined,
        !this.freeEnabled && !this.performanceEnabled && roadEffects
          ? () => {
              try {
                roadEffects();
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

  private configureCamera(
    camera: Camera,
    world: WorldCamera,
    screen: { readonly width: number; readonly height: number },
    offset?: { readonly x: number; readonly y: number }
  ): void {
    camera.matrix.copy(viewMatrix(world.params)).invert();
    camera.matrixWorldNeedsUpdate = true;
    camera.projectionMatrix.copy(
      projectionMatrix(world.params, screen.width, screen.height, offset)
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

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

  /** Actual mesh hits share the effective camera and the keys' current parallel travel. */
  freeKeyAt(
    x: number,
    y: number,
    width: number,
    height: number,
    surface?: Vector2
  ): number | undefined {
    this.pointer.set((2 * x) / Math.max(1, width) - 1, 1 - (2 * y) / Math.max(1, height));
    this.scene.updateMatrixWorld(true);
    const camera = this.performanceEnabled
      ? this.performance.camera
      : this.freeEnabled
        ? this.free.camera
        : (this.pickCamera ?? this.roadCamera);
    // The shared screen projection uses a generic Camera, so unproject its actual matrices.
    camera.updateMatrixWorld();
    const origin = new Vector3(this.pointer.x, this.pointer.y, -1).unproject(camera);
    const direction = new Vector3(this.pointer.x, this.pointer.y, 1)
      .unproject(camera)
      .sub(origin)
      .normalize();
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObjects(
      [...this.hinged.map(({ mesh }) => mesh), ...this.occluders],
      true
    );
    const hit = hits.find(({ object }) => {
      let part: Object3D | null = object;
      while (part) {
        if (!part.visible) return false;
        part = part.parent;
      }
      return true;
    });
    if (hit?.uv) surface?.copy(hit.uv);
    return hit && this.hinged.find(({ mesh }) => mesh === hit.object)?.pitch;
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

  setNativePianist(on: boolean): void {
    if (on === this.nativePianist) return;
    this.nativePianist = on;
    if (on) this.hands?.suspend();
    if (this.hands) this.hands.group.visible = false;
  }

  clearEnergy(): void {
    this.noteLights.clear();
    this.worldStage.clear();
    this.keyEmission.clear();
  }

  setKeyboardDim(on: boolean): void {
    this.appearance.setDim(on);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beforeRender = undefined;
    this.hands?.dispose();
    this.free.dispose();
    this.performance.dispose();
    this.worldStage.dispose();
    this.clear();
    this.appearance.dispose();
    this.cabinet.dispose();
    this.noteLights.dispose();
    this.rimLights.dispose();
    this.roadNotes.dispose();
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
      const key = this.keyboard.keys.get(box.pitch);
      if (!key && box.pitch !== 0) throw new Error(`keyboard88 has no key ${String(box.pitch)}`);
      const geometry = key
        ? keyboard88Geometry(key.geometry, box)
        : computerKeyboardSlabGeometry(box);
      const painted = key
        ? paintedKeyboardTop(key.materials[0], this.picture, box.black, box.uv.u1 > box.uv.u0)
        : this.top;
      const materials = this.keyEmission.create(
        box.pitch,
        painted,
        key?.materials[1] ?? this.white
      );
      if (key) this.keyEmission.ownTemplate(painted);
      const mesh = new Mesh(geometry, materials);
      mesh.position.set(box.x, 22, 0);
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
    this.hands?.layout(white);
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
