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

/** A key being struck right now: where on the hit line, and in what colour. */
export interface Strike {
  readonly x: number;
  readonly color: number;
}

/** Half the width of the road at the horizon, as a share of the view's width. */
const HORIZON_HALF_WIDTH = 0.12;
/** How much narrower the keyboard is at its back edge than at its front, per side, as a share. */
const KEYS_TILT = 0.035;
const GLOW_STRENGTH = 10;
const GLOW_ALPHA = 0.9;
const MAX_SPARKS = 400;
const SPARKS_PER_STRIKE_S = 90;
const SPARK_LIFE_S = 0.7;
const HIT_LINE_COLOR = 0xc9a8ff;

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
  private readonly road: PerspectiveMesh;
  private readonly glow: PerspectiveMesh;
  private readonly hitLine = new Graphics();
  private readonly sparkTexture: Texture;
  private readonly sparks: Spark[] = [];
  private size = { width: 0, height: 0 };
  /** How far in from each side the road meets the keyboard's back edge. */
  private inset = 0;
  private keysShift = new Matrix();
  private clock = 0;

  constructor(private readonly renderer: Renderer) {
    this.road = new PerspectiveMesh({ texture: this.texture, verticesX: 24, verticesY: 24 });
    this.glow = new PerspectiveMesh({ texture: this.texture, verticesX: 24, verticesY: 24 });
    this.glow.filters = [new BlurFilter({ strength: GLOW_STRENGTH, quality: 3 })];
    this.glow.blendMode = "add";
    this.glow.alpha = GLOW_ALPHA;
    this.keys = new PerspectiveMesh({ texture: this.keysTexture, verticesX: 24, verticesY: 8 });
    this.container.addChild(this.road, this.glow, this.keys);
    this.container.eventMode = "none";
    this.hitLine.blendMode = "add";
    this.effects.addChild(this.hitLine);
    this.effects.eventMode = "none";
    this.sparkTexture = bakeSpark(renderer);
  }

  /**
   * Sizes the road to the lane, down to the hit line at `height`, and the
   * keyboard under it down to `bottom`. The keyboard leans back too: its back
   * edge is narrower than its front, and the road meets it there.
   */
  layout(width: number, height: number, bottom: number): void {
    if (width < 1 || height < 1 || bottom <= height) return;
    this.size = { width, height };
    this.inset = width * KEYS_TILT;
    const inset = this.inset;
    this.texture.source.resize(width, height, this.renderer.resolution);
    this.keysTexture.source.resize(width, bottom - height, this.renderer.resolution);
    this.keysShift = new Matrix().translate(0, -height);
    const middle = width / 2;
    const half = width * HORIZON_HALF_WIDTH;
    for (const mesh of [this.road, this.glow]) {
      mesh.texture = this.texture;
      mesh.setCorners(middle - half, 0, middle + half, 0, width - inset, height, inset, height);
    }
    this.keys.texture = this.keysTexture;
    this.keys.setCorners(inset, height, width - inset, height, width, bottom, 0, bottom);
  }

  /** Where a point on the flat hit line lands on the road's narrower bottom edge. */
  private project(x: number): number {
    const { width } = this.size;
    return this.inset + (x * (width - this.inset * 2)) / width;
  }

  /**
   * Draws `lane` into the road and `keys` (laid out for the flat view, from
   * the hit line down) into the keyboard, then the hit line and the sparks
   * of this frame's strikes.
   */
  draw(
    lane: Container,
    keys: Container,
    flatStrikes: readonly Strike[],
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
    this.drawHitLine(strikes);
    for (const strike of strikes) this.emit(strike, deltaSeconds);
    this.moveSparks(deltaSeconds);
  }

  private drawHitLine(strikes: readonly Strike[]): void {
    const { width, height } = this.size;
    const line = this.hitLine;
    line.clear();
    // A wide faint band under a thin bright wire that crackles a little.
    const left = this.inset;
    const right = width - this.inset;
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

  private emit(strike: Strike, deltaSeconds: number): void {
    const count = Math.max(1, Math.round(SPARKS_PER_STRIKE_S * deltaSeconds));
    for (let index = 0; index < count; index++) {
      let spark = this.sparks.find((item) => item.life <= 0);
      if (!spark) {
        if (this.sparks.length >= MAX_SPARKS) return;
        const sprite = new Sprite(this.sparkTexture);
        sprite.anchor.set(0.5);
        sprite.blendMode = "add";
        this.effects.addChild(sprite);
        spark = { sprite, vx: 0, vy: 0, life: 0 };
        this.sparks.push(spark);
      }
      spark.sprite.x = strike.x + (Math.random() - 0.5) * 10;
      spark.sprite.y = this.size.height;
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
  return renderer.generateTexture({ target: dot, resolution: 2 });
}
