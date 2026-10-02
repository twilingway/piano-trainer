import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { arrivalFrame } from "./noteArrival";
import type { RoadProjection } from "./perspective";
import type { Arrival } from "./RoadLayer";

/** White Explosion from Arcadia Effector; each sprite takes its note's finger colour. */
const ATLAS = new URL("../fx/horizon-explosion.webp", import.meta.url).href;
const CELL_PX = 160;
const COLS = 5;
const FRAMES = 15;
const MAX_BURSTS = 32;

export class HorizonBurstLayer {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private frames: Texture[] = [];

  constructor() {
    this.container.eventMode = "none";
  }

  get ready(): boolean {
    return this.frames.length > 0;
  }

  async load(): Promise<void> {
    try {
      const atlas = await Assets.load<Texture>(ATLAS);
      this.frames = Array.from(
        { length: FRAMES },
        (_, index) =>
          new Texture({
            source: atlas.source,
            frame: new Rectangle(
              (index % COLS) * CELL_PX,
              Math.floor(index / COLS) * CELL_PX,
              CELL_PX,
              CELL_PX
            )
          })
      );
    } catch (error) {
      console.warn("The horizon explosion did not load; notes appear without it", error);
    }
  }

  draw(arrivals: readonly Arrival[], projection: RoadProjection, pan: number): void {
    let used = 0;
    for (const arrival of arrivals) {
      const index = arrivalFrame(arrival.age, this.frames.length);
      const texture = index === undefined ? undefined : this.frames[index];
      if (!texture || used >= MAX_BURSTS) continue;
      let sprite = this.sprites[used];
      if (!sprite) {
        sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.blendMode = "add";
        this.sprites.push(sprite);
        this.container.addChild(sprite);
      }
      const spot = projection.at(arrival.x - pan, 0);
      sprite.texture = texture;
      sprite.position.set(spot.x, spot.y);
      sprite.scale.set(Math.max(32, Math.min(72, arrival.width * 1.6)) / CELL_PX);
      sprite.tint = arrival.color;
      sprite.visible = true;
      used++;
    }
    for (let index = used; index < this.sprites.length; index++) {
      const sprite = this.sprites[index];
      if (sprite) sprite.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    for (const frame of this.frames) frame.destroy();
  }
}
