import type { BufferGeometry } from "three";
import {
  Camera,
  ColorManagement,
  DirectionalLight,
  ExternalTexture,
  Group,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Raycaster,
  Vector2
} from "three";
import { WebGLRenderer } from "three";
import type { Object3D } from "three";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import type { SongStage } from "../../song/songStage";
import type { EnergySource } from "../noteEnergy";
import { keyBoxes } from "./keyBoxes";
import { PianoCase } from "./PianoCase";
import type { KeyBox } from "./keyBoxes";
import { IVORY, ivoryMaterial, velvetMaterial } from "./keyMaterials";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE, whitePart } from "./pianoKit";
import type { KitPart, PianoKit } from "./pianoKit";
import { LiveHands } from "./liveHands";
import type { HandsSource } from "./liveHands";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import { ThreeNoteLights } from "./ThreeNoteLights";
import { ThreeKeyEmission } from "./ThreeKeyEmission";
import { KeyboardAppearance } from "./KeyboardAppearance";
import { keyGeometry } from "./keyGeometry";
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

// Pixi's colours and the keys' texture are display values: keep three in the same space.
ColorManagement.enabled = false;

/** The keys turn about a pivot this far behind the white front, units: a grand's balance rail,
 * 250 mm, so a key sinks nearly level wherever a finger presses it. */
const PIVOT = (250 * 142) / 150;
/** How far a held key turns: its front edge sinks about 9 units. */
const DIP = Math.asin(9 / PIVOT);
/** How fast a key follows the finger, per second. */
const DIP_RATE = 30;

interface Hinged {
  readonly pitch: number;
  readonly hinge: Group;
  readonly mesh: Mesh;
}

/** The keyboard drawn by three.js into Pixi's own WebGL context, on Pixi's camera. */
export class ThreeStage {
  private readonly renderer: WebGLRenderer;
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
  private readonly noteLights = new ThreeNoteLights();
  private readonly keyEmission = new ThreeKeyEmission();
  private readonly appearance: KeyboardAppearance;
  private readonly rimLights = new ThreeRimLights();
  /** Pixi's picture of the flat keys: colours, lights and stickers for the top faces. */
  private readonly picture = new ExternalTexture();
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
  private readonly cabinet = new PianoCase(this.case);
  /** The live hands, once their model has loaded; without it the sprite hands stay. */
  readonly hands: LiveHands | undefined;
  private hinged: Hinged[] = [];
  private version = -1;
  private disposed = false;
  private nativePianist = false;
  /** Pose the character after this frame's camera setup and before any scene render pass. */
  beforeRender: ((camera: Camera) => void) | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly context: WebGL2RenderingContext,
    private readonly kit: PianoKit,
    hand: Object3D | undefined
  ) {
    this.free = new FreeSceneCamera(canvas);
    this.performance = new PerformanceScene(this.scene);
    this.worldStage = new PerformanceWorldStage(this.scene);
    this.hands = hand && new LiveHands(hand);
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
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
    if (this.hands) {
      this.keys.add(this.hands.group);
      this.occluders.push(this.hands.group);
    }
  }

  /** Draws the keys over whatever is in the frame now, keeping it: the road under them. */
  draw(
    keys: KeysScene,
    picture: WebGLTexture,
    down: (pitch: number) => boolean,
    screen: { readonly width: number; readonly height: number },
    deltaSeconds: number,
    hands: HandsSource | undefined,
    energy: readonly EnergySource[] = [],
    energyDeltaSeconds = deltaSeconds,
    roadFrame?: ThreeRoadFrame,
    worldEffects = false,
    songNotes?: HandsSource["notes"]
  ): void {
    if (keys.version !== this.version) this.build(keys);
    this.picture.sourceTexture = picture;
    const roadCamera = keys.roadCamera ?? keys.camera;
    const keyboardCamera = keys.keyboardCamera ?? roadCamera;
    const { params } = roadCamera;
    const scale = params.prefs.scale;
    this.keys.scale.setScalar(scale);
    this.keys.position.x =
      this.freeEnabled || this.performanceEnabled ? 0 : (-keys.pan / 2) * scale;
    this.road.scale.copy(this.keys.scale);
    this.road.position.copy(this.keys.position);
    this.lighting.scale.copy(this.keys.scale);
    this.lighting.position.copy(this.keys.position);
    this.road.visible = roadFrame !== undefined;
    this.roadNotes.setViewport(screen.width, screen.height);
    if (!this.nativePianist) this.hands?.update(hands);
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
        this.roadGuides.update(this.boxes, roadCamera, roadFrame.beats, roadFrame.beatCount);
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
      // A finger's key turns until its top under the tip has sunk as deep as the tip.
      const pressed = press
        ? Math.asin(Math.min(1, press.drop / Math.max(1, PIVOT - press.along)))
        : 0;
      const target = Math.max(down(pitch) ? DIP : 0, pressed);
      hinge.rotation.x = press ? target : hinge.rotation.x + (target - hinge.rotation.x) * step;
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
    this.beforeRender?.(camera);
    this.renderer.resetState();
    try {
      this.renderer.setViewport(
        0,
        0,
        this.context.drawingBufferWidth,
        this.context.drawingBufferHeight
      );
      this.renderer.clearDepth();
      drawSceneCameraPasses(
        this.renderer,
        this.scene,
        this.road,
        this.keys,
        camera,
        this.keyboardCamera,
        separate
      );
    } finally {
      // Return GL defaults even if a pass failed; the host can draw its Pixi fallback safely.
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

  /** Actual mesh hits share the effective scene camera and the current key hinge transforms. */
  freeKeyAt(x: number, y: number, width: number, height: number): number | undefined {
    if (!this.freeEnabled && !this.performanceEnabled) return undefined;
    this.pointer.set((2 * x) / Math.max(1, width) - 1, 1 - (2 * y) / Math.max(1, height));
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(
      this.pointer,
      this.performanceEnabled ? this.performance.camera : this.free.camera
    );
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
    return hit && this.hinged.find(({ mesh }) => mesh === hit.object)?.pitch;
  }

  /** Something of the host's that rides with the keys: the local pianist. */
  addToKeys(object: Object3D): void {
    this.keys.add(object);
    this.occluders.push(object);
    this.free.invalidate();
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  removeFromKeys(object: Object3D): void {
    object.removeFromParent();
    const index = this.occluders.indexOf(object);
    if (index >= 0) this.occluders.splice(index, 1);
    this.free.invalidate();
    this.performance.invalidate();
    this.worldStage.invalidate();
  }

  /** The song's performance-scene dressing: its neon sign and whether the bass sets the stage on fire. */
  setSongStage(stage: SongStage | undefined): void {
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
    this.renderer.dispose();
  }

  private build(keys: KeysScene): void {
    this.free.invalidate();
    this.clear(true);
    this.version = keys.version;
    const boxes = keyBoxes(keys);
    this.boxes = boxes;
    this.performance.layout(boxes);
    this.appearance.layout(boxes);
    this.noteLights.layout(boxes, keys.roadCamera ?? keys.camera);
    this.rimLights.layout(boxes, keys.camera.params.prefs.scale);
    const black = new Set(boxes.filter((box) => box.black).map((box) => box.pitch));
    for (const box of boxes) {
      const part = box.black
        ? "black"
        : whitePart(black.has(box.pitch - 1), black.has(box.pitch + 1));
      const geometry = keyGeometry(this.part(part), box);
      geometry.computeBoundingBox();
      const bottom = geometry.boundingBox?.min.y ?? 0;
      const materials = this.keyEmission.create(
        box.pitch,
        this.top,
        box.black ? this.black : this.white
      );
      const mesh = new Mesh(geometry, materials);
      // The hinge sits at the pivot behind the key, level with its bottom; the key hangs forward.
      mesh.position.set(0, -bottom, PIVOT);
      const hinge = new Group();
      hinge.position.set(box.x, bottom, -PIVOT);
      hinge.add(mesh);
      this.keys.add(hinge);
      this.hinged.push({ pitch: box.pitch, hinge, mesh });
    }
    this.buildBody(boxes);
    this.keyEmission.endLayout();
  }

  /** Rails and back panel across the range, a cheek at each end. */
  private buildBody(boxes: readonly KeyBox[]): void {
    const whites = boxes.filter((box) => !box.black);
    if (whites.length === 0) return;
    const left = Math.min(...whites.map((box) => box.x - box.width / 2));
    const right = Math.max(...whites.map((box) => box.x + box.width / 2));
    const across = (whites[0]?.width ?? 0) / KIT_WHITE;
    if (whites[0]) this.hands?.layout(whites[0]);
    const add = (
      geometry: BufferGeometry,
      material: MeshStandardMaterial,
      x: number,
      sx: number
    ) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, KIT_TOP, 0);
      mesh.scale.set(sx, 1000, KIT_DEPTH);
      this.body.add(mesh);
    };
    const centre = (left + right) / 2;
    add(this.part("felt"), this.felt, centre, right - left);
    this.cabinet.layout(left, right, across);
    this.body.add(this.cabinet.group);
  }

  private part(name: KitPart): BufferGeometry {
    const geometry = this.kit.get(name);
    if (!geometry) throw new Error(`piano kit has no part "${name}"`);
    return geometry;
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
