import {
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  PerspectiveMesh,
  RenderTexture,
  Sprite
} from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import { roadProjection } from "./perspective";
import type { Projected, RoadProjection } from "./perspective";

/** A key being struck right now: where on the hit line, and in what colour. */
export interface Strike {
  /** The key struck: a strike carries on from frame to frame while its key is held. */
  readonly pitch: number;
  readonly x: number;
  readonly color: number;
}

/** A note coming over the horizon: where it appears and how bright its flash still is. */
export interface Arrival {
  /** Across the flat scene: the middle of the note's key. */
  readonly x: number;
  readonly color: number;
  /** 1 as it appears, fading to 0 as it moves on. */
  readonly strength: number;
}

/*
 * The road as in the mockup: one floor in perspective, a trapezoid that
 * spans the view at the hit line and narrows to this share of it at the
 * horizon, so every key's lane runs to a point of its own up there and the
 * lanes fan out towards the player. A note is born small at the horizon in a
 * flash and grows as it comes. The keyboard in front is not in that
 * perspective: it is the flat keyboard squashed in height.
 */
export const DEFAULT_ROAD_SHAPE: RoadShape = { far: 0.1, horizon: 0.1 };

/** The road's shape, the player's to tune: a wider keyboard wants a lower horizon. */
export interface RoadShape {
  /** The road's width at the horizon, as a share of its width at the hit line. */
  readonly far: number;
  /** The horizon, as a share of the way down from the top of the view to the hit line. */
  readonly horizon: number;
}
/** The keyboard's height on the road, as a share of its flat height. */
const KEYS_SQUASH = 0.9;
const GLOW_STRENGTH = 10;
/** The widest texture most GPUs, phones included, will take. */
const MAX_TEXTURE_PX = 8192;
const GLOW_ALPHA = 0.9;
const MAX_SPARKS = 400;
/** A burst when a key is struck, then a thin stream while it is held, per second. */
const SPARKS_PER_BURST = 24;
const SPARKS_PER_HELD_S = 30;
const SPARK_LIFE_S = 0.7;
const HIT_LINE_COLOR = 0xc9a8ff;
const HORIZON_COLOR = 0x3fd6ff;

interface Spark {
  readonly sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

/**
 * The trial "road" view: the flat lane of falling notes is drawn into a
 * texture and laid back in perspective, so the notes come out of the
 * horizon towards the keys. A blurred copy added over it makes them glow; a
 * crackling hit line and sparks in the finger's colour mark every strike.
 * The lane is still drawn by its owner; this only shows it.
 */
export class RoadLayer {
  readonly container = new Container();
  /** Effects over the keys' top edge: the hit line and the sparks. */
  readonly effects = new Container();
  private readonly texture = RenderTexture.create({ width: 1, height: 1 });
  private readonly keysTexture = RenderTexture.create({ width: 1, height: 1 });
  private readonly keys: PerspectiveMesh;
  /** The lane laid on the floor, and a blurred copy over it for the glow. */
  private readonly road: PerspectiveMesh;
  private readonly glow: PerspectiveMesh;
  private readonly glows = new Container();
  private readonly hitLine = new Graphics();
  /** The glowing horizon and the flashes of notes coming over it. */
  private readonly horizon = new Graphics();
  private readonly sparkTexture: Texture;
  private readonly sparks: Spark[] = [];
  private size = { width: 0, height: 0 };
  /** The hit line on screen: where the road meets the keys. */
  private hit = { y: 0, left: 0, right: 0 };
  private keysShift = new Matrix();
  /** The floor's perspective; undefined before the first layout. */
  private projection: RoadProjection | undefined;
  private horizonY = 0;
  private shape: RoadShape = DEFAULT_ROAD_SHAPE;
  /** How far the view is scrolled along a keyboard wider than it, in the scene's pixels. */
  private pan = 0;
  /** The view's width: the scene (the whole keyboard) may be wider. */
  private viewWidth = 0;
  private hitY = 0;
  private clock = 0;
  /** Sparks owed to each held key: the fraction of a spark carried to the next frame. */
  private held = new Map<number, number>();

  constructor(private readonly renderer: Renderer) {
    // One blur for every strip's glow; its last pass blends as the filter does: add, for a glow.
    this.glows.filters = [
      new BlurFilter({ strength: GLOW_STRENGTH, quality: 3, blendMode: "add" })
    ];
    this.glows.alpha = GLOW_ALPHA;
    this.keys = new PerspectiveMesh({ texture: this.keysTexture, verticesX: 48, verticesY: 24 });
    this.road = new PerspectiveMesh({ texture: this.texture, verticesX: 32, verticesY: 64 });
    this.glow = new PerspectiveMesh({ texture: this.texture, verticesX: 32, verticesY: 64 });
    this.glows.addChild(this.glow);
    this.horizon.blendMode = "add";
    this.container.addChild(this.road, this.glows, this.horizon, this.keys);
    this.container.eventMode = "none";
    this.hitLine.blendMode = "add";
    this.effects.addChild(this.hitLine);
    this.effects.eventMode = "none";
    this.sparkTexture = bakeSpark(renderer);
  }

  /**
   * Lays the flat scene — `width` wide, the lane down to the hit line at
   * `height`, the keys under it down to `bottom` — on the floor in
   * perspective, seen through a view `viewWidth` wide.
   */
  layout(width: number, height: number, bottom: number, viewWidth: number): void {
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
    this.keys.visible = keysHeight >= 1;
    this.keysTexture.source.resize(viewWidth, Math.max(1, keysHeight), this.renderer.resolution);
    this.hitY = bottom - keysHeight * KEYS_SQUASH;
    this.horizonY = this.hitY * this.shape.horizon;
    this.projection = roadProjection(viewWidth, this.hitY, this.horizonY, this.shape.far);
    // A resized texture keeps its object: the meshes take it again to pick up the new size.
    this.road.texture = this.texture;
    this.glow.texture = this.texture;
    this.keys.texture = this.keysTexture;
    this.keys.setCorners(0, this.hitY, viewWidth, this.hitY, viewWidth, bottom, 0, bottom);
    this.hit = { y: this.hitY, left: 0, right: viewWidth };
    this.setPan(this.pan, true);
  }

  /** A new shape for the road; it takes effect on the next layout. */
  setShape(shape: RoadShape): void {
    this.shape = shape;
  }

  /** Scrolls the view along the scene: the road slides under the view's fixed perspective. */
  setPan(pan: number, force = false): void {
    if (!force && pan === this.pan) return;
    this.pan = pan;
    this.keysShift = new Matrix().translate(-pan, -this.size.height);
    const projection = this.projection;
    if (!projection) return;
    const left = -pan;
    const right = this.size.width - pan;
    const farLeft = projection.at(left, 0);
    const farRight = projection.at(right, 0);
    for (const mesh of [this.road, this.glow]) {
      mesh.setCorners(
        farLeft.x,
        farLeft.y,
        farRight.x,
        farRight.y,
        right,
        this.hitY,
        left,
        this.hitY
      );
    }
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

  /** The point of the flat keyboard under a point of the laid keys on screen; undefined off them. */
  keysPointAt(x: number, y: number): { x: number; y: number } | undefined {
    if (!this.keys.visible || this.size.width < 1 || y < this.hitY) return undefined;
    return { x: x + this.pan, y: this.size.height + (y - this.hitY) / KEYS_SQUASH };
  }

  /** Where a point on the flat hit line lands on screen. */
  private project(x: number): number {
    return x - this.pan;
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
    const strikes = flatStrikes.map((strike) => ({ ...strike, x: this.project(strike.x) }));
    this.drawHorizon(arrivals);
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
    for (const filter of this.glows.filters) filter.destroy();
    // A mesh's destroy leaves its geometry's buffers to the garbage collector; free them now.
    for (const mesh of [this.road, this.glow, this.keys]) mesh.geometry.destroy();
    this.container.destroy({ children: true });
    this.effects.destroy({ children: true });
    this.texture.destroy(true);
    this.keysTexture.destroy(true);
    this.sparkTexture.destroy(true);
  }

  /** The horizon glowing across the far end of the road, flashing where notes come over it. */
  private drawHorizon(arrivals: readonly Arrival[]): void {
    const line = this.horizon;
    line.clear();
    const projection = this.projection;
    if (!projection) return;
    const y = this.horizonY;
    const width = this.viewWidth;
    // Across the whole view, as in the mockup: a glow that fades out above and below a bright
    // wire, the glow reaching further down onto the road than up into the sky.
    for (let step = 1; step <= 8; step++) {
      line
        .rect(0, y - step * 2, width, step * 2 + step * 5)
        .fill({ color: HORIZON_COLOR, alpha: 0.035 });
    }
    line.rect(0, y - 3, width, 6).fill({ color: HORIZON_COLOR, alpha: 0.45 });
    line.rect(0, y - 1, width, 2).fill({ color: 0xffffff, alpha: 0.95 });
    for (const arrival of arrivals) {
      const spot = projection.at(arrival.x - this.pan, 0);
      const strength = arrival.strength;
      line
        .circle(spot.x, y, 6 + 18 * strength)
        .fill({ color: arrival.color, alpha: 0.3 * strength });
      line.circle(spot.x, y, 2 + 6 * strength).fill({ color: 0xffffff, alpha: 0.9 * strength });
      // A short streak along the horizon, like light catching an edge.
      line
        .rect(spot.x - 30 * strength, y - 1.5, 60 * strength, 3)
        .fill({ color: arrival.color, alpha: 0.6 * strength });
    }
  }

  private drawHitLine(strikes: readonly Strike[]): void {
    const { y: height, left, right } = this.hit;
    const line = this.hitLine;
    line.clear();
    // A wide faint band under a thin bright wire that crackles a little.
    line.rect(left, height - 6, right - left, 12).fill({ color: HIT_LINE_COLOR, alpha: 0.12 });
    const step = 6;
    line.moveTo(left, height);
    for (let x = left + step; x <= right; x += step) {
      const near = strikes.some((strike) => Math.abs(strike.x - x) < 40);
      const jitter = Math.sin(x * 0.37 + this.clock * 31) * Math.sin(x * 0.11 - this.clock * 17);
      line.lineTo(x, height + jitter * (near ? 5 : 1.5));
    }
    line.stroke({ width: 2, color: HIT_LINE_COLOR, alpha: 0.95 });
    for (const strike of strikes) {
      line.circle(strike.x, height, 14).fill({ color: strike.color, alpha: 0.35 });
      line.circle(strike.x, height, 6).fill({ color: 0xffffff, alpha: 0.8 });
    }
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
      spark.sprite.y = this.hit.y;
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
