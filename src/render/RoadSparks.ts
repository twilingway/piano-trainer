import { Container, Sprite, type Renderer, type Texture } from "./flatThree";
import { bakeSpark } from "./roadTextures";
import type { Strike } from "./RoadLayer";

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

/** Pooled decorative sparks share the renderer's existing frame delta. */
export class RoadSparks {
  readonly container = new Container();
  private readonly sparkTexture: Texture;
  private readonly sparks: Spark[] = [];
  private held = new Map<number, number>();
  constructor(renderer: Renderer) {
    this.sparkTexture = bakeSpark(renderer);
  }
  draw(strikes: readonly Strike[], deltaSeconds: number): void {
    const held = new Map<number, number>();
    for (const strike of strikes) {
      const owed = this.held.get(strike.pitch);
      const due = owed === undefined ? SPARKS_PER_BURST : owed + SPARKS_PER_HELD_S * deltaSeconds;
      const count = Math.floor(due);
      this.emit(strike, count);
      held.set(strike.pitch, due - count);
    }
    this.held = held;
    this.moveSparks(deltaSeconds);
  }
  destroy(): void {
    this.container.destroy({ children: true });
    this.sparkTexture.destroy(true);
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
        this.container.addChild(sprite);
        spark = { sprite, vx: 0, vy: 0, life: 0 };
        this.sparks.push(spark);
      }
      spark.sprite.x = strike.x + (Math.random() - 0.5) * 10;
      spark.sprite.y = strike.screenY ?? 0;
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
