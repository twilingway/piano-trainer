import {
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  PerspectiveMesh,
  RenderTexture,
  Sprite
} from "pixi.js";
import type { Application, PointData, Renderer, Texture } from "pixi.js";
import { bakeFog, bakeSpark, drawRoadHorizon } from "./roadTextures";
import { StaffRoadLayer } from "./StaffRoadLayer";
import { RoadGlassLayer } from "./RoadGlassLayer";
import type { KeyRect } from "./keyboardLayout";
import { HorizonBurstLayer } from "./HorizonBurstLayer";

import { DEFAULT_CAMERA, normalizeCamera } from "./worldCamera";
import type { CameraPrefs, WorldCamera } from "./worldCamera";
import { PerspectiveKeyboardLayer } from "./PerspectiveKeyboardLayer";
import type { Geometry } from "./viewGeometry";
import { legacyKeyboardPoint, legacyRoadProjection } from "./legacyKeyboardGeometry";
import type { Projected, RoadProjection } from "./perspective";
import { handSurface } from "./handProjection";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { DEFAULT_ROAD_SHAPE, roadLayoutCamera, type RoadShape } from "./roadLayoutCamera";
import type { HandsGeometry } from "./HandsLayer";
import type { KeyboardLayer, KeyStyle } from "./KeyboardLayer";
import { ThreeKeysHost } from "./three/ThreeKeysHost";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { readableRoadTop } from "./readableRoadNote";
import type { EnergySource } from "./noteEnergy";
import type { HandsLayer } from "./HandsLayer";

/** A key being struck right now: where on the hit line, and in what colour. */
export interface Strike {
  /** The key struck: a strike carries on from frame to frame while its key is held. */
  readonly pitch: number;
  readonly x: number;
  readonly color: number;
  readonly screenY?: number | undefined;
}

/** A note coming over the horizon: where it appears and how bright its flash still is. */
export interface Arrival {
  /** Across the flat scene: the middle of the note's key. */
  readonly x: number;
  readonly color: number;
  /** 1 as it appears, fading to 0 as it moves on. */
  readonly age: number;
  readonly width: number;
  readonly screenX?: number | undefined;
  readonly screenY?: number | undefined;
}

/** The fog over the far road reaches this share of the way down to the keys. */
const FOG_REACH = 0.5;
const FOG_COLOR = 0x020c18;

export { DEFAULT_ROAD_SHAPE, type RoadShape } from "./roadLayoutCamera";

const GLOW_STRENGTH = 10;
/** The widest texture most GPUs, phones included, will take. */
const MAX_TEXTURE_PX = 8192;
const GLOW_ALPHA = 0.9;
const MAX_SPARKS = 400;
/** A burst when a key is struck, then a thin stream while it is held, per second. */
const SPARKS_PER_BURST = 24;
const SPARKS_PER_HELD_S = 30;
const SPARK_LIFE_S = 0.7;

interface Spark {
  readonly sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

/** Shared world camera for the road, physical piano faces and every note/effect anchor.
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
  private shape: RoadShape = DEFAULT_ROAD_SHAPE;
  private cameraPrefs: CameraPrefs = DEFAULT_CAMERA;
  private camera: WorldCamera | undefined;
  private keyboardCamera: WorldCamera | undefined;
  private keyboardTop = false;
  private readonly keyHeights = new Map<number, number>();
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
  private readonly sparkTexture: Texture;
  private readonly sparks: Spark[] = [];
  private size = { width: 0, height: 0 };
  /** The hit line on screen: where the road meets the keys. */
  private hit = { y: 0, left: 0, right: 0 };
  private keysShift = new Matrix();
  /** The floor's perspective; undefined before the first layout. */
  private projection: RoadProjection | undefined;
  private horizonY = 0;
  /** How far the view is scrolled along a keyboard wider than it, in the scene's pixels. */
  private pan = 0;
  /** The view's width: the scene (the whole keyboard) may be wider. */
  private viewWidth = 0;
  private hitY = 0;
  private bottom = 0;
  private clock = 0;
  private plasmaClock = 0;
  private readonly nativeRoad = new ThreeRoadFrame();
  private lastLane: Container | undefined;
  /** Sparks owed to each held key: the fraction of a spark carried to the next frame. */
  private held = new Map<number, number>();

  /** The "3d" style's keys, drawn by three.js; without an app there are none. */
  private readonly three: ThreeKeysHost | undefined;

  constructor(
    private readonly renderer: Renderer,
    app?: Application,
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
    this.sparkTexture = bakeSpark(renderer);
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

  clearEnergy(): void {
    this.three?.clearEnergy();
  }

  addTrailAnchor(x: number, width: number, color: number, alpha: number): void {
    if (this.three?.drawsRoad && this.camera)
      this.nativeRoad.addTrailAnchor(x, width, color, alpha, this.camera);
  }

  beginNotes(): void {
    this.nativeRoad.begin();
    this.glass.begin();
  }

  setKeyboard(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry): void {
    this.keyHeights.clear();
    for (const key of keys.values())
      this.keyHeights.set(key.x + key.width / 2, key.black ? 36 : 22);
    if (this.perspective) {
      this.keysShift = new Matrix().translate(0, -geometry.keyboardTop);
      this.keyboardCamera =
        this.keyboardTop && this.three?.on && this.camera
          ? mixedKeyboardCamera(this.camera, geometry.keyboardHeight)
          : this.camera;
      this.keys.layout(keys, geometry, this.keysTexture);
      if (this.camera) this.keys.draw(this.camera, this.pan, this.keyboardCamera);
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
    if (!this.projection || this.size.height <= 0) return undefined;
    if (!this.camera) {
      const spot = this.projection.at(
        keyX - this.pan + offset,
        Math.max(0, Math.min(1, y / this.size.height))
      );
      return { ...spot, y: spot.y - lift * spot.scale };
    }
    const progress = Math.max(0, Math.min(1, y / this.size.height));
    const { near } = this.camera;
    // On the 3D keys every note ends on the back panel's edge, whatever its key.
    const keyHeight = this.three?.on ? near.y : (this.keyHeights.get(keyX) ?? 22);
    // On the floor's own depth, as the arcade road does: the notes ride the road, not over it.
    return this.camera.project(
      this.camera.sourceX(keyX - this.pan + offset),
      keyHeight + lift / 2,
      near.z + (1 - progress) * (this.camera.roadFarZ - near.z)
    );
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
    tailOffset = 0
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
        tailOffset
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
    this.camera = this.perspective
      ? roadLayoutCamera(
          viewWidth,
          width,
          bottom - handRoom,
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
    this.hit = { y: this.hitY, left: 0, right: viewWidth };
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

  setRoadGuides(on: boolean): void {
    this.nativeRoad.guides = on;
    this.staff.container.visible = on;
  }

  fitHoldTop(x: number, top: number, bottom: number, width: number, duration = 0): number {
    return this.three?.drawsRoad && this.camera
      ? readableRoadTop(x, top, bottom, width, this.size.height, this.camera, duration)
      : top;
  }

  setShape(shape: RoadShape): void {
    this.shape = shape;
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

    const left = -pan;
    const right = this.size.width - pan;
    const farLeft = projection.at(left, 0);
    const farRight = projection.at(right, 0);
    const nearLeft = projection.at(left, 1);
    const nearRight = projection.at(right, 1);
    for (const mesh of [this.road, this.glow]) {
      mesh.setCorners(
        farLeft.x,
        farLeft.y,
        farRight.x,
        farRight.y,
        nearRight.x,
        nearRight.y,
        nearLeft.x,
        nearLeft.y
      );
    }
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
    const projection = this.projection;
    if (!projection || this.size.height <= 0) return undefined;
    return projection.at(x - this.pan, Math.max(0, Math.min(1, y / this.size.height)));
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

  keysPointAt(x: number, y: number): { x: number; y: number } | undefined {
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
      screenY: this.notePlace(strike.x, this.size.height)?.y ?? this.hit.y
    }));
    this.drawHorizon();
    if (this.projection) this.arrivals.draw(arrivals, this.projection, this.pan);
    const held = new Map<number, number>();
    for (const strike of strikes) {
      const owed = this.held.get(strike.pitch);
      // A burst on the strike, then a stream whose rate does not depend on the frame rate.
      const due = owed === undefined ? SPARKS_PER_BURST : owed + SPARKS_PER_HELD_S * deltaSeconds;
      const count = Math.floor(due);
      this.emit(strike, count);
      held.set(strike.pitch, due - count);
    }
    this.held = held;
    this.moveSparks(deltaSeconds);
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
    this.effects.destroy({ children: true });
    this.texture.destroy(true);
    this.keysTexture.destroy(true);
    this.sparkTexture.destroy(true);
  }

  /** The horizon glowing across the far end of the road, flashing where notes come over it. */
  private drawHorizon(): void {
    const line = this.horizon;
    line.clear();
    if (this.three?.drawsRoad && !this.nativeRoad.guides) return;
    if (!this.projection) return;
    drawRoadHorizon(line, this.horizonY, this.viewWidth);
  }

  private emit(strike: Strike, count: number): void {
    for (let index = 0; index < count; index++) {
      let spark = this.sparks.find((item) => item.life <= 0);
      // A full pool takes back its oldest spark, so a late strike is never left dark.
      if (!spark && this.sparks.length >= MAX_SPARKS) {
        spark = this.sparks.reduce((oldest, item) => (item.life < oldest.life ? item : oldest));
      }
      if (!spark) {
        const sprite = new Sprite(this.sparkTexture);
        sprite.anchor.set(0.5);
        sprite.blendMode = "normal";
        this.effects.addChild(sprite);
        spark = { sprite, vx: 0, vy: 0, life: 0 };
        this.sparks.push(spark);
      }
      spark.sprite.x = strike.x + (Math.random() - 0.5) * 10;
      spark.sprite.y = strike.screenY ?? this.hit.y;
      spark.sprite.tint = strike.color;
      spark.vx = (Math.random() - 0.5) * 140;
      spark.vy = -(80 + Math.random() * 260);
      spark.life = SPARK_LIFE_S * (0.5 + Math.random() * 0.5);
      spark.sprite.visible = true;
    }
  }

  private moveSparks(deltaSeconds: number): void {
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= deltaSeconds;
      if (spark.life <= 0) {
        spark.sprite.visible = false;
        continue;
      }
      // Sparks rise, slow down and fade.
      spark.vy += 220 * deltaSeconds;
      spark.sprite.x += spark.vx * deltaSeconds;
      spark.sprite.y += spark.vy * deltaSeconds;
      spark.sprite.alpha = Math.min(1, spark.life / (SPARK_LIFE_S * 0.5));
      spark.sprite.scale.set(0.4 + spark.life);
    }
  }
}
