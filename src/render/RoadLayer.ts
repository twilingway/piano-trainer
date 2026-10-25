import type { CameraComposition } from "./cameraComposition";
import { FreeRoadRoutes } from "./freeRoadRoutes";
import type { ProjectionParameters } from "./stylizedProjection";
export type { StaffWorldSource } from "../staff/staffWorldSnapshot";
import type { StaffWorldSource } from "../staff/staffWorldSnapshot";
import type { FallingNoteStyle } from "./fallingNoteStyle";
import { DEFAULT_FREE_DIRECT_FIELD, type FreeRoadLayout } from "./freeRoadLayout";
import { NeonRailLayer } from "./NeonRailLayer";
import type { FlatEffectOptions } from "./flatEffectSettings";
import { Container, Graphics, Matrix, RenderTexture, Sprite } from "./flatThree";
import type { Application, PointData, Renderer } from "./flatThree";
import { bakeFog, drawRoadHorizon } from "./roadTextures";
import { HorizonBurstLayer } from "./HorizonBurstLayer";
import type { KeyRect } from "./keyboardLayout";
import { DEFAULT_CAMERA, normalizeCamera, type CameraPrefs, type WorldCamera } from "./worldCamera";
import { NativeKeyboardScene } from "./NativeKeyboardScene";
import type { Geometry } from "./viewGeometry";
import type { Projected, RoadProjection } from "./perspective";
import { handSurface } from "./handProjection";
import { nativeNoteCameras, nativeViewCameras } from "./nativeViewCameras";
import { nativeRoadCameraLayout } from "./nativeRoadCameraLayout";
import { flatRoadCamera } from "./flatRoadCamera";
import { metricCameraForKeys } from "./metricKeyboardCamera";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";
import { nativeKeyContactLanes } from "./nativeKeyContactAnchors";
import type { NoteLaneProjection } from "./noteLaneProjection";
import {
  FREE_BLACK_LANE,
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
import type { Arrival } from "./roadTypes";
export type { Strike, Arrival } from "./roadTypes";
export { DEFAULT_ROAD_SHAPE, type RoadShape } from "./roadLayoutCamera";

/** One native road; the selected keyboard retains its own drawing and pointer geometry. */
export class RoadLayer {
  setLegacyLabels(labels: readonly { renderable: boolean }[]): void {
    this.nativeRoad.legacyLabels = labels;
  }
  setNoteProjection(value: ProjectionParameters): void {
    this.nativeRoad.noteProjection = value;
  }
  readonly container = new Container();
  readonly effects = new Container();
  private readonly keysTexture = RenderTexture.create({ width: 1, height: 1 });
  private readonly keys = new NativeKeyboardScene();
  private style: KeyStyle = "classic";
  private fallingNoteStyle: FallingNoteStyle = "filled";
  private freeRoadLayout: FreeRoadLayout = DEFAULT_FREE_DIRECT_FIELD;
  setFreeRoadLayout(layout: FreeRoadLayout): void {
    this.freeRoadLayout = layout;
  }
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
  private whiteLane: NoteLaneProjection | undefined;
  private contactKeys: ReadonlyMap<number, KeyRect> | undefined;
  private contactLanes: ReadonlyMap<number, NoteLaneProjection> | undefined;
  private physicalContactLanes: ReadonlyMap<number, NoteLaneProjection> | undefined;
  private readonly horizon = new Graphics();
  private readonly arrivals = new HorizonBurstLayer();
  private readonly rail = new NeonRailLayer();
  private readonly fog = new Sprite(bakeFog());
  private size = { width: 0, height: 0 };
  private keysShift = new Matrix();
  private projection: RoadProjection | undefined;
  private horizonY = 0;
  private pan = 0;
  private viewWidth = 0;
  private hitY = 0;
  private keyboardTopY = 0;
  private clock = 0;
  private readonly nativeRoad = new ThreeRoadFrame();
  private freeRoutes: FreeRoadRoutes | undefined;
  private readonly three: ThreeKeysHost | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly app?: Application,
    keyboard?: KeyboardLayer,
    hands?: HandsLayer
  ) {
    this.horizon.blendMode = "add";
    this.fog.tint = 0x020c18;
    this.container.addChild(this.fog, this.horizon, this.arrivals.container, this.rail.container);
    this.container.eventMode = this.effects.eventMode = "none";
    this.three =
      app && keyboard
        ? new ThreeKeysHost(app, this.container, this.keys, keyboard, hands)
        : undefined;
  }
  private get nativeKeyboard(): boolean {
    return this.style === "3d" && !this.computerKeyboard;
  }
  setEnergy(sources: readonly EnergySource[], deltaSeconds: number): void {
    this.three?.setEnergy(sources, deltaSeconds);
  }
  clearEnergy = (): void => this.three?.clearEnergy();
  addTrailAnchor(x: number, width: number, color: number, alpha: number): void {
    if (this.drawsNativeRoad && this.camera)
      this.nativeRoad.addTrailAnchor(x, width, color, alpha, this.camera, this.noteLane(x));
  }
  beginNotes(): void {
    this.nativeRoad.begin();
    this.nativeRoad.direct = !this.notesPerspective;
    if (this.contactKeys && this.camera && !this.computerKeyboard) {
      this.freeRoutes ??= new FreeRoadRoutes();
      this.freeRoutes.update(this.contactKeys, this.camera, this.freeRoadLayout);
      this.nativeRoad.freeLayout = this.freeRoadLayout;
      this.nativeRoad.freeLanes = this.freeRoutes.lanes;
      this.physicalContactLanes = this.freeRoutes.contacts;
    }
    this.nativeRoad.noteStyle = this.computerKeyboard
      ? "glass"
      : this.style === "3d"
        ? this.fallingNoteStyle
        : "flat";
    this.nativeRoad.flatMaterial = this.nativeRoad.noteStyle === "flat";
  }
  endNotes(): void {
    this.three?.setRoadFrame(this.nativeRoad);
  }
  setKeyboard(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry, dockKeyboard = false): void {
    this.computerKeyboard = keys.size === 1 && keys.has(0);
    this.keyboardTopY = geometry.keyboardTop;
    this.keys.container.visible = geometry.keyboardHeight > 0;
    this.keyHeights = roadKeyHeights(keys, true);
    this.keysShift = new Matrix().translate(0, -geometry.keyboardTop);
    void this.three?.setEnabled(this.nativeKeyboard, this.notesPerspective || this.nativeKeyboard);
    if (this.nativeKeyboard && this.camera) {
      this.camera = metricCameraForKeys(this.camera, keys, this.cameraHeight, this.shape.horizon);
      const cameras = nativeViewCameras(
        this.camera,
        geometry.keyboardHeight,
        this.keyboardTop,
        this.notesPerspective,
        this.cameraHeight,
        this.shape.horizon,
        this.app?.screen.height ?? this.cameraHeight,
        dockKeyboard ? geometry.keyboardTop + geometry.keyboardHeight : undefined,
        this.keys.container.position,
        this.shape.far,
        this.size.width
      );
      this.keyboardCamera = cameras.keyboard;
      Object.assign(this, nativeRoadCameraLayout(cameras, this.viewWidth, this.fog));
    } else {
      const cameras = flatRoadCamera(
        this.viewWidth,
        this.cameraHeight,
        geometry.keyboardTop,
        this.notesPerspective,
        this.shape.horizon,
        this.keys.container.position,
        this.app?.screen.height ?? this.cameraHeight,
        this.shape.far,
        this.size.width
      );
      this.keyboardCamera = cameras.keyboard;
      Object.assign(this, nativeRoadCameraLayout(cameras, this.viewWidth, this.fog));
    }
    this.contactKeys = keys;
    this.refreshContactLanes();
    this.keys.layout(keys, geometry, this.keysTexture, true);
    this.setPan(this.pan, true);
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
  private refreshContactLanes(): void {
    if (!this.contactKeys) return;
    this.contactLanes = nativeKeyContactLanes(this.contactKeys, this.blackLane, this.whiteLane);
    this.physicalContactLanes = nativeKeyContactLanes(this.contactKeys, FREE_BLACK_LANE);
  }
  private noteLane(keyX: number): NoteLaneProjection | undefined {
    if (this.nativeKeyboard && this.contactLanes)
      return (
        this.freeCamera || this.three?.performanceScene
          ? this.physicalContactLanes
          : this.contactLanes
      )?.get(keyX);
    if (this.freeCamera || this.three?.performanceScene)
      return this.noteLaneY(keyX) === BLACK_NOTE_FLOOR ? FREE_BLACK_LANE : undefined;
    return this.noteLaneY(keyX) === BLACK_NOTE_FLOOR ? this.blackLane : undefined;
  }
  get mistOffsetX(): number {
    return this.nativeKeyboard ? 0 : this.keys.container.position.x;
  }
  get scenePan(): number {
    return this.pan;
  }
  beatY(y: number): number {
    if (this.drawsNativeRoad && this.camera) this.nativeRoad.beat(y, this.size.height, this.camera);
    return y;
  }
  get isPerspective(): boolean {
    return this.nativeKeyboard;
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
    pitch?: number,
    finger?: number,
    label?: string
  ): boolean {
    if (!this.drawsNativeRoad || !this.camera) return false;
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
      pitch,
      finger,
      label
    );
    return true;
  }
  get arrivalEffectsReady(): boolean {
    return this.arrivals.ready && !this.freeCamera && !this.three?.performanceScene;
  }
  async loadArrivalEffects(): Promise<void> {
    await Promise.all([this.arrivals.load(), this.rail.load()]);
  }
  layout(width: number, height: number, bottom: number, viewWidth: number, handRoom = 0): void {
    this.container.visible = width >= 1 && viewWidth >= 1 && height >= 1 && bottom >= height;
    this.effects.visible = this.container.visible;
    if (!this.container.visible) {
      this.size = { width: 0, height: 0 };
      return;
    }
    this.size = { width, height };
    this.viewWidth = viewWidth;
    const resolution = Math.min(this.renderer.resolution, 8192 / width);
    this.keysTexture.source.resize(width, Math.max(1, bottom - height), resolution);
    this.cameraHeight = Math.max(1, bottom - handRoom);
    this.camera = roadLayoutCamera(
      viewWidth,
      width,
      this.cameraHeight,
      this.cameraPrefs,
      true,
      this.shape.horizon
    );
    this.projection = this.camera.road;
    this.hitY = this.projection.at(viewWidth / 2, 1).y;
    this.horizonY = this.projection.at(viewWidth / 2, 0).y;
    this.fog.position.set(0, this.horizonY);
    this.fog.width = viewWidth;
    this.fog.height = Math.max(1, (this.hitY - this.horizonY) * 0.5);
  }
  setFallingNoteStyle(style: FallingNoteStyle): void {
    this.fallingNoteStyle = style;
  }
  setKeyStyle(style: KeyStyle): Promise<void> {
    this.style = style;
    return (
      this.three?.setEnabled(this.nativeKeyboard, this.notesPerspective || this.nativeKeyboard) ??
      Promise.resolve()
    );
  }
  get drawsNativeRoad(): boolean {
    return this.three?.drawsRoad === true;
  }
  get drawsNativeKeyboard(): boolean {
    return this.three?.on === true && this.keys.container.visible;
  }
  setSceneEffects(layers: readonly Container[]): void {
    this.three?.setSceneEffects(layers, [
      this.horizon,
      this.arrivals.container,
      this.rail.container
    ]);
  }
  setWorldScoreSource = (source: StaffWorldSource | undefined): void =>
    this.three?.setWorldScoreSource(source);

  setFreeCamera(on: boolean, changed: (on: boolean) => void): void {
    if (!this.three) return;
    this.three.onFreeCamera = changed;
    this.three.setFreeCamera(on);
  }
  get handStatus(): "idle" | "loading" | "ready" | "error" {
    return this.three?.handStatus ?? "idle";
  }
  setAnimationEffects(options: FlatEffectOptions): void {
    this.nativeRoad.burning = options.burning;
    this.effects.renderable = options.presses;
    this.three?.setEffects(options);
  }
  get freeCamera(): boolean {
    return this.three?.freeCamera === true;
  }
  get sceneCamera(): boolean {
    return this.three?.sceneCamera === true;
  }
  resetFreeCamera = (): void => this.three?.resetFreeCamera();
  setCameraComposition = (mode: CameraComposition): void => this.three?.setCameraComposition(mode);
  setWorldFov = (fov: number): void => this.three?.setWorldFov(fov);
  setFreeCameraMovement = (on: boolean): void => this.three?.setFreeCameraMovement(on);
  setPerformanceScene = (on: boolean): void => this.three?.setPerformanceScene(on);
  setSongTime = (time: number): void => {
    this.nativeRoad.songTime = time;
    this.three?.setSongTime(time);
  };
  setKeyboardDim = (on: boolean): void => this.three?.setKeyboardDim(on);
  setRoadGuides(on: boolean): void {
    this.nativeRoad.guides = on;
  }
  fitHoldTop(x: number, top: number, bottom: number, width: number, duration = 0): number {
    return this.drawsNativeRoad && this.camera
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
    void this.three?.setRoadEnabled(on || this.nativeKeyboard);
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
  setPan(pan: number, force = false): void {
    if (!force && pan === this.pan) return;
    this.pan = pan;
    if (this.camera?.roadWidth)
      this.camera.roadWidth.pan = pan * (this.camera.params.sourceUnits ?? 0.5);
    if (this.camera) this.keys.draw(this.camera, pan, this.keyboardCamera);
  }
  clarity(y: number): number {
    return this.size.height <= 0 ? 1 : Math.max(0, Math.min(1, y / this.size.height / 0.5));
  }
  get hitLineY(): number {
    return this.hitY;
  }
  place(x: number, y: number): Projected | undefined {
    return this.size.height <= 0
      ? undefined
      : this.projection?.at(x - this.pan, Math.max(0, Math.min(1, y / this.size.height)));
  }
  handPlace(x: number, y: number, geometry: HandsGeometry, reach?: number): Projected {
    if (!this.nativeKeyboard || !this.camera) return { x: x - this.pan, y, scale: 1 };
    const surface = handSurface(geometry, y, reach);
    const camera = this.keyboardCamera ?? this.camera;
    return camera.project(camera.sourceX(x - this.pan), surface.height, surface.depth);
  }
  setKeysOffset(offset: PointData): void {
    const changed = this.keys.container.x !== offset.x || this.keys.container.y !== offset.y;
    this.keys.container.position.copyFrom(offset);
    if (!changed || !this.keyboardCamera) return;
    const cameras = nativeNoteCameras(
      this.keyboardCamera,
      this.notesPerspective,
      this.cameraHeight,
      this.shape.horizon,
      this.app?.screen.height ?? this.cameraHeight,
      offset,
      this.shape.far,
      this.size.width
    );
    Object.assign(this, nativeRoadCameraLayout(cameras, this.viewWidth, this.fog));
    this.refreshContactLanes();
    this.setPan(this.pan, true);
  }
  keysPointAt(x: number, y: number): { x: number; y: number; pitch?: number } | undefined {
    if (this.nativeKeyboard && this.three?.on)
      return freeRoadKeyPoint(this.three, x, y, this.keyboardTopY);
    return { x: x + this.pan - this.keys.container.x, y: y - this.keys.container.y };
  }
  draw(
    _lane: Container,
    keys: Container,
    arrivals: readonly Arrival[],
    deltaSeconds: number
  ): void {
    if (this.size.width < 1) return;
    if (this.nativeKeyboard)
      this.renderer.render({
        container: keys,
        target: this.keysTexture,
        clear: true,
        transform: this.keysShift
      });
    this.clock += deltaSeconds;
    this.nativeRoad.visualTime = this.clock;
    this.rail.draw(
      this.clock,
      this.viewWidth,
      this.hitY,
      this.nativeKeyboard &&
        this.keys.container.visible &&
        this.container.visible &&
        !this.sceneCamera
    );
    this.horizon.clear();
    if ((!this.drawsNativeRoad || this.nativeRoad.guides) && this.projection)
      drawRoadHorizon(this.horizon, this.horizonY, this.viewWidth);
    if (this.projection) this.arrivals.draw(arrivals, this.projection, this.pan);
  }
  destroy(): void {
    this.three?.destroy();
    this.arrivals.destroy();
    this.rail.destroy();
    this.keys.destroy();
    this.container.destroy({ children: true });
    this.effects.destroy({ children: true });
    this.keysTexture.destroy(true);
  }
}
