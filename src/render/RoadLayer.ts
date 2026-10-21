import {
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  PerspectiveMesh,
  RenderTexture,
  Sprite
} from "pixi.js";
import type { Application, PointData, Renderer } from "pixi.js";
import { bakeFog, drawRoadHorizon } from "./roadTextures";
import { StaffRoadLayer } from "./StaffRoadLayer";
import { RoadGlassLayer } from "./RoadGlassLayer";
import type { KeyRect } from "./keyboardLayout";
import { HorizonBurstLayer } from "./HorizonBurstLayer";

import { DEFAULT_CAMERA, normalizeCamera, type CameraPrefs, type WorldCamera } from "./worldCamera";
import { PerspectiveKeyboardLayer } from "./PerspectiveKeyboardLayer";
import type { Geometry } from "./viewGeometry";
import { legacyKeyboardPoint, legacyRoadProjection } from "./legacyKeyboardGeometry";
import type { Projected, RoadProjection } from "./perspective";
import { handSurface } from "./handProjection";
import { nativeViewCameras } from "./nativeViewCameras";
import { metricCameraForKeys } from "./metricKeyboardCamera";
import { RoadSparks } from "./RoadSparks";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";
import type { NoteLaneProjection } from "./noteLaneProjection";
import {
  FREE_BLACK_LANE,
  drawRoadCorners,
  freeRoadKeyPoint,
  roadKeyHeights,
  roadNotePlace
} from "./roadScenePoints";
import { DEFAULT_ROAD_SHAPE, roadLayoutCamera, type RoadShape } from "./roadLayoutCamera";
import type { HandsGeometry, HandsLayer } from "./HandsLayer";
import type { KeyboardLayer, KeyStyle } from "./KeyboardLayer";
import { ThreeKeysHost } from "./three/ThreeKeysHost";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { readableRoadTop } from "./readableRoadNote";
import type { EnergySource } from "./noteEnergy";

import type { Strike, Arrival } from "./roadTypes";
export type { Strike, Arrival } from "./roadTypes";

const FOG_REACH = 0.5;
const FOG_COLOR = 0x020c18;

export { DEFAULT_ROAD_SHAPE, type RoadShape } from "./roadLayoutCamera";

const GLOW_STRENGTH = 10;
/** The widest texture most GPUs, phones included, will take. */
const MAX_TEXTURE_PX = 8192;
const GLOW_ALPHA = 0.9;
/** Independent note and piano cameras share physical contact and source geometry.
 * Existing flat layers supply baked materials; this layer only projects their geometry.
 */
export class RoadLayer {
  readonly container = new Container();
  /** Effects over the keys' top edge: the hit line and the sparks. */
  readonly effects = new Container();
  private readonly texture = RenderTexture.create({ width: 1, height: 1 });
  private readonly keysTexture = RenderTexture.create({ width: 1, height: 1 });
  private readonly keys = new PerspectiveKeyboardLayer();
  private readonly legacyKeys: PerspectiveMesh;
  private perspective = false;
  private computerKeyboard = false;
  private shape: RoadShape = DEFAULT_ROAD_SHAPE;
  private cameraPrefs: CameraPrefs = DEFAULT_CAMERA;
  private camera: WorldCamera | undefined;
  private keyboardCamera: WorldCamera | undefined;
  private keyboardTop = false;
  private notesPerspective = true;
  private cameraHeight = 1;
  private keyHeights = new Map<number, number>();
  private blackLane: NoteLaneProjection | undefined;
  /** The lane laid on the floor, and a blurred copy over it for the glow. */
  private readonly road: PerspectiveMesh;
  private readonly glow: PerspectiveMesh;
  private readonly glows = new Container();
  /** The glowing horizon and the flashes of notes coming over it. */
  private readonly horizon = new Graphics();
  private readonly arrivals = new HorizonBurstLayer();
  private readonly staff: StaffRoadLayer;
  private readonly glass = new RoadGlassLayer();
  /** Haze over the far road: lanes and notes come out of it as they near. */
  private readonly fog = new Sprite(bakeFog());
  private readonly sparks: RoadSparks;
  private size = { width: 0, height: 0 };
  /** The hit line on screen: where the road meets the keys. */
  private keysShift = new Matrix();
  /** The floor's perspective; undefined before the first layout. */
  private projection: RoadProjection | undefined;
  private horizonY = 0;
  /** How far the view is scrolled along a keyboard wider than it, in the scene's pixels. */
  private pan = 0;
  /** The view's width: the scene (the whole keyboard) may be wider. */
  private viewWidth = 0;
  private hitY = 0;
  private keyboardTopY = 0;
  private bottom = 0;
  private clock = 0;
  private plasmaClock = 0;
  private readonly nativeRoad = new ThreeRoadFrame();
  private lastLane: Container | undefined;

  /** The "3d" style's keys, drawn by three.js; without an app there are none. */
  private readonly three: ThreeKeysHost | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly app?: Application,
    keyboard?: KeyboardLayer,
    hands?: HandsLayer
  ) {
    // One blur for every strip's glow; its last pass blends as the filter does: add, for a glow.
    this.staff = new StaffRoadLayer();
    this.glows.filters = [
      new BlurFilter({ strength: GLOW_STRENGTH, quality: 3, blendMode: "add" })
    ];
    this.glows.alpha = GLOW_ALPHA;
    this.legacyKeys = new PerspectiveMesh({
      texture: this.keysTexture,
      verticesX: 48,
      verticesY: 24
    });
    this.road = new PerspectiveMesh({ texture: this.texture, verticesX: 32, verticesY: 64 });
    this.glow = new PerspectiveMesh({ texture: this.texture, verticesX: 32, verticesY: 64 });
    this.glows.addChild(this.glow);
    this.horizon.blendMode = "add";
    this.fog.tint = FOG_COLOR;
    this.container.addChild(
      this.road,
      this.glows,
      this.staff.container,
      this.glass.container,
      this.fog,
      this.horizon,
      this.arrivals.container,
      this.keys.container,
      this.legacyKeys
    );
    this.container.eventMode = "none";
    this.effects.eventMode = "none";
    this.sparks = new RoadSparks(renderer);
    this.effects.addChild(this.sparks.container);
    this.three =
      app &&
      keyboard &&
      new ThreeKeysHost(app, this.container, this.keys, keyboard, hands, () => {
        this.restoreRoad();
      });
  }

  setEnergy(sources: readonly EnergySource[], deltaSeconds: number): void {
    this.three?.setEnergy(sources, deltaSeconds);
    this.plasmaClock += Math.min(0.05, Math.max(0, deltaSeconds));
  }

  clearEnergy = (): void => this.three?.clearEnergy();

  addTrailAnchor(x: number, width: number, color: number, alpha: number): void {
    if (this.three?.drawsRoad && this.camera)
      this.nativeRoad.addTrailAnchor(x, width, color, alpha, this.camera, this.noteLane(x));
  }

  beginNotes(): void {
    this.nativeRoad.begin();
    this.glass.begin();
  }

  setKeyboard(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry, dockKeyboard = false): void {
    this.computerKeyboard = keys.size === 1 && keys.has(0);
    this.keyboardTopY = geometry.keyboardTop;
    this.keyHeights = roadKeyHeights(keys, this.three?.on === true);
    this.blackLane = undefined;
    if (this.perspective) {
      this.keysShift = new Matrix().translate(0, -geometry.keyboardTop);
      if (this.three?.on && this.camera) {
        if (!this.computerKeyboard)
          this.camera = metricCameraForKeys(
            this.camera,
            keys,
            this.cameraHeight,
            this.shape.horizon
          );
        const cameras = nativeViewCameras(
          this.camera,
          geometry.keyboardHeight,
          this.keyboardTop,
          this.notesPerspective,
          this.cameraHeight,
          this.shape.horizon,
          this.app?.screen.height ?? this.cameraHeight,
          dockKeyboard ? geometry.keyboardTop + geometry.keyboardHeight : undefined
        );
        this.keyboardCamera = cameras.keyboard;
        this.camera = cameras.notes;
        this.blackLane = cameras.blackLane;
        this.projection = this.camera.road;
        this.hitY = this.projection.at(this.viewWidth / 2, 1).y;
        this.horizonY = this.projection.at(this.viewWidth / 2, 0).y;
        this.fog.position.set(0, this.horizonY);
        this.fog.height = Math.max(1, (this.hitY - this.horizonY) * FOG_REACH);
      } else this.keyboardCamera = this.camera;
      this.keys.layout(keys, geometry, this.keysTexture, this.three?.on === true);
      if (this.camera) this.setPan(this.pan, true);
    }
    this.staff.setKeys(keys);
    if (this.projection) this.staff.draw(this.projection, this.pan);
  }

  endNotes(): void {
    this.glass.end();
    this.three?.setRoadFrame(this.nativeRoad);
  }

  noteLaneX(keyX: number): number {
    return keyX - this.pan;
  }

  notePlace(keyX: number, y: number, offset = 0, lift = 0): Projected | undefined {
    return roadNotePlace(
      this.camera,
      this.projection,
      this.size.height,
      this.pan,
      keyX,
      y,
      offset,
      lift,
      this.noteLane(keyX),
      this.keyHeights.get(keyX)
    );
  }

  noteLaneY(keyX: number): number {
    return this.keyHeights.get(keyX) ?? WHITE_NOTE_FLOOR;
  }

  private noteLane(keyX: number): NoteLaneProjection | undefined {
    if (this.freeCamera || this.three?.performanceScene)
      return this.noteLaneY(keyX) === BLACK_NOTE_FLOOR ? FREE_BLACK_LANE : undefined;
    return this.three?.on && this.noteLaneY(keyX) === BLACK_NOTE_FLOOR ? this.blackLane : undefined;
  }

  get keysOffsetX(): number {
    return this.keys.container.position.x;
  }

  get scenePan(): number {
    return this.pan;
  }

  /** The measure lines lie on the floor with the notes, where the lane texture puts them. */
  beatY(y: number): number {
    if (this.three?.drawsRoad && this.camera)
      this.nativeRoad.beat(y, this.size.height, this.camera);
    return y;
  }

  get isPerspective(): boolean {
    return this.perspective;
  }

  drawHold(
    keyX: number,
    top: number,
    bottom: number,
    width: number,
    tint: number,
    alpha: number,
    duration = 0,
    id = "",
    tailOffset = 0,
    pitch?: number
  ): boolean {
    if (this.three?.drawsRoad && this.camera) {
      this.nativeRoad.add(
        keyX,
        top,
        bottom,
        width,
        tint,
        alpha,
        this.size.height,
        this.camera,
        duration,
        id,
        tailOffset,
        this.noteLane(keyX),
        pitch
      );
      return true;
    }
    if (!this.glass.ready || !this.projection || bottom <= top) return false;
    this.glass.draw(
      top,
      bottom,
      width,
      tint,
      alpha,
      this.clock,
      this.size.height,
      (y, offset, lift) => this.notePlace(keyX, y, offset, lift) ?? { x: 0, y: 0 },
      this.plasmaClock
    );
    return true;
  }

  get arrivalEffectsReady(): boolean {
    return this.arrivals.ready;
  }

  async loadArrivalEffects(): Promise<void> {
    await Promise.all([this.arrivals.load(), this.glass.load()]);
  }

  /**
   * Lays the flat scene — `width` wide, the lane down to the hit line at
   * `height`, the keys under it down to `bottom` — on the floor in
   * perspective, seen through a view `viewWidth` wide.
   */
  layout(width: number, height: number, bottom: number, viewWidth: number, handRoom = 0): void {
    // Too little room for a road: hide it rather than draw the last layout's.
    this.container.visible = width >= 1 && viewWidth >= 1 && height >= 1 && bottom >= height;
    this.effects.visible = this.container.visible;
    if (!this.container.visible) {
      this.size = { width: 0, height: 0 };
      return;
    }
    this.size = { width, height };
    this.viewWidth = viewWidth;
    // A song across the whole keyboard is wide: keep the texture within what GPUs take.
    const resolution = Math.min(this.renderer.resolution, MAX_TEXTURE_PX / width);
    this.texture.source.resize(width, height, resolution);
    const keysHeight = bottom - height;
    // Without keys the road runs down to the bottom and there is no keyboard to lay.
    this.bottom = bottom;
    this.keys.container.visible = this.perspective && keysHeight >= 1;
    this.legacyKeys.visible = !this.perspective && keysHeight >= 1;
    this.keysTexture.source.resize(
      this.perspective ? width : viewWidth,
      Math.max(1, keysHeight),
      this.perspective ? resolution : this.renderer.resolution
    );
    this.cameraHeight = Math.max(1, bottom - handRoom);
    this.camera = this.perspective
      ? roadLayoutCamera(
          viewWidth,
          width,
          this.cameraHeight,
          this.cameraPrefs,
          this.three?.on === true,
          this.shape.horizon
        )
      : undefined;
    const legacy = legacyRoadProjection(viewWidth, height, bottom, this.shape);
    this.projection = this.camera?.road ?? legacy.projection;
    this.hitY = this.camera ? this.projection.at(viewWidth / 2, 1).y : legacy.hitY;
    this.horizonY = this.camera ? this.projection.at(viewWidth / 2, 0).y : legacy.horizonY;
    this.legacyKeys.texture = this.keysTexture;
    this.legacyKeys.setCorners(0, this.hitY, viewWidth, this.hitY, viewWidth, bottom, 0, bottom);
    this.fog.position.set(0, this.horizonY);
    this.fog.width = viewWidth;
    this.fog.height = Math.max(1, (this.hitY - this.horizonY) * FOG_REACH);
    this.road.texture = this.texture;
    this.glow.texture = this.texture;
    this.staff.draw(this.projection, this.pan);
    this.setPan(this.pan, true);
  }

  /** The keys under the road: in perspective for "perspective", by three.js for "3d". */
  setKeyStyle(style: KeyStyle): Promise<void> {
    const loaded = this.three?.setEnabled(style === "3d") ?? Promise.resolve();
    this.perspective = style === "perspective" || style === "3d";
    return loaded;
  }

  get drawsNativeRoad(): boolean {
    return this.three?.drawsRoad === true;
  }

  setSceneEffects(layers: readonly Container[]): void {
    this.three?.setSceneEffects(layers, [this.horizon, this.arrivals.container]);
  }

  setFreeCamera(on: boolean, changed: (on: boolean) => void): void {
    if (!this.three) return;
    this.three.onFreeCamera = changed;
    this.three.setFreeCamera(on);
  }

  get freeCamera(): boolean {
    return this.three?.freeCamera === true;
  }

  get sceneCamera(): boolean {
    return this.three?.sceneCamera === true;
  }

  resetFreeCamera = (): void => this.three?.resetFreeCamera();

  setPerformanceScene = (on: boolean): void => this.three?.setPerformanceScene(on);

  setSongTime = (time: number): void => {
    this.nativeRoad.songTime = time;
  };

  setKeyboardDim = (on: boolean): void => this.three?.setKeyboardDim(on);

  setRoadGuides(on: boolean): void {
    this.nativeRoad.guides = on;
    this.staff.container.visible = on;
  }

  fitHoldTop(x: number, top: number, bottom: number, width: number, duration = 0): number {
    return this.three?.drawsRoad && this.camera
      ? readableRoadTop(
          x,
          top,
          bottom,
          width,
          this.size.height,
          this.camera,
          duration,
          this.noteLane(x)
        )
      : top;
  }

  setShape(shape: RoadShape): void {
    this.shape = shape;
  }

  setNotesPerspective(on: boolean): void {
    this.notesPerspective = on;
  }

  get keyboardOverhead(): boolean {
    return this.keyboardCamera?.params.prefs.pitch === 90;
  }

  setKeyboardTop(on: boolean): void {
    this.keyboardTop = on;
  }

  setCamera(prefs: CameraPrefs): void {
    this.cameraPrefs = normalizeCamera(prefs);
  }

  /** Scrolls the view along the scene: the road slides under the view's fixed perspective. */
  setPan(pan: number, force = false): void {
    if (!force && pan === this.pan) return;
    this.pan = pan;
    if (this.camera) this.keys.draw(this.camera, pan, this.keyboardCamera);
    else this.keysShift = new Matrix().translate(-pan, -this.size.height);
    const projection = this.projection;
    if (!projection) return;
    this.staff.draw(projection, pan);

    drawRoadCorners([this.road, this.glow], projection, -pan, this.size.width - pan);
  }

  /** How clear a point of the flat lane is through the fog: 0 at the horizon, 1 out of it. */
  clarity(y: number): number {
    if (this.size.height <= 0) return 1;
    return Math.max(0, Math.min(1, y / this.size.height / FOG_REACH));
  }

  /** The hit line's height on screen, where the road meets the keys. */
  get hitLineY(): number {
    return this.hitY;
  }

  /** Where a point of the flat scene lands in perspective, and how much it shrinks there. */
  place(x: number, y: number): Projected | undefined {
    if (this.size.height <= 0) return undefined;
    return this.projection?.at(x - this.pan, Math.max(0, Math.min(1, y / this.size.height)));
  }

  /** Whole hands are a separate overlay, never cut into individual key materials. */
  handPlace(x: number, y: number, geometry: HandsGeometry, reach?: number): Projected {
    if (this.camera) {
      const surface = handSurface(geometry, y, reach);
      const camera = this.keyboardCamera ?? this.camera;
      return camera.project(camera.sourceX(x - this.pan), surface.height, surface.depth);
    }
    const share = (y - this.size.height) / Math.max(1, this.bottom - this.size.height);
    return { x: x - this.pan, y: this.hitY + share * (this.bottom - this.hitY), scale: 1 };
  }

  /** The point of the flat keyboard under a point of the laid keys on screen; undefined off them. */
  /** The keys moved off the hit line by the player; the road and its notes stay. */
  setKeysOffset(offset: PointData): void {
    this.keys.container.position.copyFrom(offset);
    this.legacyKeys.position.copyFrom(offset);
  }

  keysPointAt(x: number, y: number): { x: number; y: number; pitch?: number } | undefined {
    if (this.three?.on && (!this.computerKeyboard || this.three.sceneCamera))
      return freeRoadKeyPoint(this.three, x, y, this.keyboardTopY);
    x -= this.keys.container.x;
    y -= this.keys.container.y;
    if (this.perspective) return this.keys.container.visible ? this.keys.pointAt(x, y) : undefined;
    return this.legacyKeys.visible
      ? legacyKeyboardPoint(x, y, this.pan, this.hitY, this.size.height)
      : undefined;
  }

  /** Where a point on the flat hit line lands on screen. */
  private project(x: number): number {
    return this.notePlace(x, this.size.height)?.x ?? x - this.pan;
  }

  /**
   * Draws `lane` into the road and `keys` (laid out for the flat view, from
   * the hit line down) into the keyboard, then the horizon with the flashes
   * of the notes coming over it, the hit line and the sparks of this frame's
   * strikes.
   */
  draw(
    lane: Container,
    keys: Container,
    flatStrikes: readonly Strike[],
    arrivals: readonly Arrival[],
    deltaSeconds: number
  ): void {
    if (this.size.width < 1) return;
    this.lastLane = lane;
    const native = this.three?.drawsRoad === true;
    this.road.renderable = this.glows.renderable = !native;
    this.staff.container.visible = !native || this.nativeRoad.guides;
    if (!native) this.renderer.render({ container: lane, target: this.texture, clear: true });
    this.renderer.render({
      container: keys,
      target: this.keysTexture,
      clear: true,
      transform: this.keysShift
    });
    this.clock += deltaSeconds;
    this.nativeRoad.visualTime = this.clock;
    const strikes = flatStrikes.map((strike) => ({
      ...strike,
      x: this.project(strike.x),
      screenY: this.notePlace(strike.x, this.size.height)?.y ?? this.hitY
    }));
    this.drawHorizon();
    if (this.projection) this.arrivals.draw(arrivals, this.projection, this.pan);
    this.sparks.draw(strikes, deltaSeconds);
  }

  private restoreRoad(): void {
    this.road.renderable = this.glows.renderable = true;
    if (this.lastLane)
      this.renderer.render({ container: this.lastLane, target: this.texture, clear: true });
    if (!this.camera) return;
    this.glass.begin();
    this.nativeRoad.replay(this.size.height, this.camera, (x, top, bottom, width, color, alpha) => {
      this.drawHold(x, top, bottom, width, color, alpha);
    });
    this.glass.end();
  }

  destroy(): void {
    this.three?.destroy();
    this.arrivals.destroy();
    this.glass.destroy();
    for (const filter of this.glows.filters) filter.destroy();
    // A mesh's destroy leaves its geometry's buffers to the garbage collector; free them now.
    this.keys.destroy();
    for (const mesh of [this.road, this.glow, this.legacyKeys]) mesh.geometry.destroy();
    this.container.destroy({ children: true });
    this.sparks.destroy();
    this.effects.destroy({ children: true });
    this.texture.destroy(true);
    this.keysTexture.destroy(true);
  }

  /** The horizon glowing across the far end of the road, flashing where notes come over it. */
  private drawHorizon(): void {
    const line = this.horizon;
    line.clear();
    if (this.three?.drawsRoad && !this.nativeRoad.guides) return;
    if (!this.projection) return;
    drawRoadHorizon(line, this.horizonY, this.viewWidth);
  }
}
