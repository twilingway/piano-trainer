import {
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  PerspectiveMesh,
  RenderTexture,
  Sprite,
  Texture
} from "pixi.js";
import type { Application, PointData, Renderer } from "pixi.js";
import { StaffRoadLayer } from "./StaffRoadLayer";
import { RoadGlassLayer } from "./RoadGlassLayer";
import type { KeyRect } from "./keyboardLayout";
import { HorizonBurstLayer } from "./HorizonBurstLayer";

import { DEFAULT_CAMERA, normalizeCamera, worldCamera, KEYS_BACK, PANEL_EDGE } from "./worldCamera";
import type { CameraPrefs, WorldCamera } from "./worldCamera";
import { PerspectiveKeyboardLayer } from "./PerspectiveKeyboardLayer";
import type { Geometry } from "./viewGeometry";
import { legacyKeyboardPoint, legacyRoadProjection } from "./legacyKeyboardGeometry";
import type { Projected, RoadProjection } from "./perspective";
import { handSurface } from "./handProjection";
import type { HandsGeometry } from "./HandsLayer";
import type { KeyboardLayer, KeyStyle } from "./KeyboardLayer";
import { ThreeKeysHost } from "./three/ThreeKeysHost";

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

export const DEFAULT_ROAD_SHAPE: RoadShape = { far: 0.1, horizon: 0.1 };

/** The road's shape, the player's to tune: a wider keyboard wants a lower horizon. */
export interface RoadShape {
  /** The road's width at the horizon, as a share of its width at the hit line. */
  readonly far: number;
  /** The horizon, as a share of the way down from the top of the view to the hit line. */
  readonly horizon: number;
}

const GLOW_STRENGTH = 10;
/** The widest texture most GPUs, phones included, will take. */
const MAX_TEXTURE_PX = 8192;
const GLOW_ALPHA = 0.9;
const MAX_SPARKS = 400;
/** A burst when a key is struck, then a thin stream while it is held, per second. */
const SPARKS_PER_BURST = 24;
const SPARKS_PER_HELD_S = 30;
const SPARK_LIFE_S = 0.7;
const HORIZON_COLOR = 0x3fd6ff;

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
  private readonly keyHeights = new Map<number, number>();
  /** The lane laid on the floor, and a blurred copy over it for the glow. */
  private readonly road: PerspectiveMesh;
  private readonly glow: PerspectiveMesh;
  private readonly glows = new Container();
  private readonly hitLine = new Graphics();
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
  /** Sparks owed to each held key: the fraction of a spark carried to the next frame. */
  private held = new Map<number, number>();

  /** The "3d" style's keys, drawn by three.js; without an app there are none. */
  private readonly three: ThreeKeysHost | undefined;

  constructor(
    private readonly renderer: Renderer,
    app?: Application,
    keyboard?: KeyboardLayer
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
    this.hitLine.blendMode = "add";
    this.effects.addChild(this.hitLine);
    this.effects.eventMode = "none";
    this.sparkTexture = bakeSpark(renderer);
    this.three = app && keyboard && new ThreeKeysHost(app, this.container, this.keys, keyboard);
  }

  beginNotes(): void {
    this.glass.begin();
  }

  setKeyboard(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry): void {
    this.keyHeights.clear();
    for (const key of keys.values())
      this.keyHeights.set(key.x + key.width / 2, key.black ? 36 : 22);
    if (this.perspective) {
      this.keysShift = new Matrix().translate(0, -geometry.keyboardTop);
      this.keys.layout(keys, geometry, this.keysTexture);
      if (this.camera) this.keys.draw(this.camera, this.pan);
    }
    this.staff.setKeys(keys);
    if (this.projection) this.staff.draw(this.projection, this.pan);
  }

  endNotes(): void {
    this.glass.end();
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
    alpha: number
  ): boolean {
    if (!this.glass.ready || !this.projection || bottom <= top) return false;
    this.glass.draw(
      top,
      bottom,
      width,
      tint,
      alpha,
      this.clock,
      this.size.height,
      (y, offset, lift) => this.notePlace(keyX, y, offset, lift) ?? { x: 0, y: 0 }
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
    const near = this.three?.on ? PANEL_EDGE : KEYS_BACK;
    this.camera = this.perspective
      ? worldCamera(viewWidth, Math.max(1, bottom - handRoom), this.cameraPrefs, near)
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
    this.placeHitLine();
    this.staff.draw(this.projection, this.pan);
    this.setPan(this.pan, true);
  }

  /** The keys under the road: in perspective for "perspective", by three.js for "3d". */
  setKeyStyle(style: KeyStyle): Promise<void> {
    const loaded = this.three?.setEnabled(style === "3d") ?? Promise.resolve();
    this.perspective = style === "perspective" || style === "3d";
    this.placeHitLine();
    return loaded;
  }

  /** Behind the perspective keys a glow; over flat keys and the 3D panel's edge a bright wire. */
  private get wire(): boolean {
    return !this.perspective || this.three?.on === true;
  }

  private placeHitLine(): void {
    if (this.wire) this.effects.addChildAt(this.hitLine, 0);
    else this.container.addChildAt(this.hitLine, this.container.getChildIndex(this.keys.container));
  }

  setShape(shape: RoadShape): void {
    this.shape = shape;
  }

  setCamera(prefs: CameraPrefs): void {
    this.cameraPrefs = normalizeCamera(prefs);
  }

  /** Scrolls the view along the scene: the road slides under the view's fixed perspective. */
  setPan(pan: number, force = false): void {
    if (!force && pan === this.pan) return;
    this.pan = pan;
    if (this.camera) this.keys.draw(this.camera, pan);
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
      return this.camera.project(this.camera.sourceX(x - this.pan), surface.height, surface.depth);
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
    this.renderer.render({ container: lane, target: this.texture, clear: true });
    this.renderer.render({
      container: keys,
      target: this.keysTexture,
      clear: true,
      transform: this.keysShift
    });
    this.clock += deltaSeconds;
    const strikes = flatStrikes.map((strike) => ({
      ...strike,
      x: this.project(strike.x),
      screenY: this.notePlace(strike.x, this.size.height)?.y ?? this.hit.y
    }));
    this.drawHorizon();
    if (this.projection) this.arrivals.draw(arrivals, this.projection, this.pan);
    this.drawHitLine(strikes);
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
    const projection = this.projection;
    if (!projection) return;
    const y = this.horizonY;
    const width = this.viewWidth;
    // Across the whole view, quiet as in the mockup: a thin blue line in a faint haze that
    // reaches further down onto the road than up; the notes' flashes are the bright part.
    for (let step = 1; step <= 6; step++) {
      line.rect(0, y - step, width, step + step * 4).fill({ color: HORIZON_COLOR, alpha: 0.018 });
    }
    line.rect(0, y - 1.5, width, 3).fill({ color: HORIZON_COLOR, alpha: 0.18 });
    line.rect(0, y - 0.5, width, 1).fill({ color: HORIZON_COLOR, alpha: 0.6 });
  }

  private drawHitLine(strikes: readonly Strike[]): void {
    const { y: height, left, right } = this.hit;
    const line = this.hitLine;
    line.clear();
    if (!this.wire && this.projection) {
      const keyboardLeft = Math.max(left, this.projection.at(-this.pan, 1).x);
      const keyboardRight = Math.min(right, this.projection.at(this.size.width - this.pan, 1).x);
      if (keyboardRight <= keyboardLeft) return;
      // Behind the projected keys, only a diffuse glow hints at the road edge.
      for (let step = 7; step >= 1; step--) {
        line
          .rect(keyboardLeft, height - step * 3, keyboardRight - keyboardLeft, step * 6)
          .fill({ color: HORIZON_COLOR, alpha: 0.008 });
      }
      return;
    }
    // In place of the felt, as in the mockup: a glowing blue band over the keys under a bright
    // wire that crackles a little where a key is struck.
    for (let step = 1; step <= 6; step++) {
      line
        .rect(left, height - step * 3, right - left, step * 6)
        .fill({ color: HORIZON_COLOR, alpha: 0.05 });
    }
    // The band's core shimmers: its brightness drifts along it in slow waves, never still.
    const shimmerStep = 24;
    for (let x = left; x < right; x += shimmerStep) {
      const wave =
        Math.sin(x * 0.013 + this.clock * 1.7) * 0.5 + Math.sin(x * 0.041 - this.clock * 2.9) * 0.5;
      line
        .rect(x, height - 3, shimmerStep + 1, 6)
        .fill({ color: HORIZON_COLOR, alpha: 0.42 + 0.18 * wave });
    }
    // Round every sounding key the line flares in its note's colour, fading out to the sides.
    for (const strike of strikes) {
      for (let ring = 1; ring <= 5; ring++) {
        const reach = ring * 26;
        line
          .rect(strike.x - reach, (strike.screenY ?? height) - 3 - ring, reach * 2, 6 + ring * 2)
          .fill({ color: strike.color, alpha: 0.12 });
      }
    }
    const step = 6;
    line.moveTo(left, height);
    for (let x = left + step; x <= right; x += step) {
      const near = strikes.some((strike) => Math.abs(strike.x - x) < 40);
      const jitter = Math.sin(x * 0.37 + this.clock * 31) * Math.sin(x * 0.11 - this.clock * 17);
      line.lineTo(x, height + jitter * (near ? 4 : 0));
    }
    line.stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
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
        sprite.blendMode = "add";
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

/** A soft round dot: bright middle, fading edge. */
function bakeSpark(renderer: Renderer): Texture {
  const dot = new Graphics();
  for (let ring = 6; ring >= 1; ring--) {
    dot.circle(8, 8, ring * 1.3).fill({ color: 0xffffff, alpha: 0.25 });
  }
  const texture = renderer.generateTexture({ target: dot, resolution: 2 });
  dot.destroy();
  return texture;
}

/** A vertical fade, opaque at the top: the fog, tinted the background's colour. */
function bakeFog(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.55)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, 128);
  return Texture.from(canvas);
}
