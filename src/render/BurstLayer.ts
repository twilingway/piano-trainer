import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

/*
 * The strike burst baked by Arcadia Effector from src/fx/piano-hit.json: a
 * flash and a spray of sparks, white so a tint gives it the finger's colour.
 * The numbers are the atlas's as the editor exported it.
 */
const BURST_ATLAS = new URL("../fx/piano-hit.webp", import.meta.url).href;
const BURST = {
  frameWidth: 160,
  frameHeight: 160,
  cols: 4,
  frames: 12,
  fps: 24,
  /** Where the strike is in a frame: the effect's origin sits 50 of 384 below the middle. */
  anchorY: 0.5 + 50 / 384
} as const;
/** The burst's width on screen, in white-key widths. */
const BURST_PER_WIDTH = 3.2;
/** At most this many bursts at once; a chord rarely needs more than ten. */
const MAX_BURSTS = 24;

interface Burst {
  readonly sprite: Sprite;
  age: number;
}

/**
 * Plays the strike burst on a key at the hit line, in its finger's colour.
 * Sprites are pooled; without the atlas there is simply no burst.
 */
export class BurstLayer {
  readonly container = new Container();
  private frames: Texture[] = [];
  private readonly bursts: Burst[] = [];

  constructor() {
    this.container.eventMode = "none";
  }

  /** Loads the atlas; a failure leaves the layer empty rather than the view broken. */
  async load(): Promise<void> {
    try {
      const atlas = await Assets.load<Texture>(BURST_ATLAS);
      this.frames = Array.from(
        { length: BURST.frames },
        (_, index) =>
          new Texture({
            source: atlas.source,
            frame: new Rectangle(
              (index % BURST.cols) * BURST.frameWidth,
              Math.floor(index / BURST.cols) * BURST.frameHeight,
              BURST.frameWidth,
              BURST.frameHeight
            )
          })
      );
    } catch (error) {
      console.warn("The strike burst did not load; playing without it", error);
    }
  }

  /** A burst on the hit line at `x`, sized for keys `keyWidth` wide, in `color`. */
  play(x: number, y: number, keyWidth: number, color: number): void {
    const first = this.frames[0];
    if (!first) return;
    let burst = this.bursts.find((item) => !item.sprite.visible);
    if (!burst && this.bursts.length >= MAX_BURSTS) {
      // A full pool takes back its oldest burst, so a late strike is never left dark.
      burst = this.bursts.reduce((oldest, item) => (item.age > oldest.age ? item : oldest));
    }
    if (!burst) {
      const sprite = new Sprite(first);
      sprite.anchor.set(0.5, BURST.anchorY);
      sprite.blendMode = "add";
      this.container.addChild(sprite);
      burst = { sprite, age: 0 };
      this.bursts.push(burst);
    }
    burst.age = 0;
    const sprite = burst.sprite;
    sprite.texture = first;
    sprite.position.set(x, y);
    sprite.scale.set((keyWidth * BURST_PER_WIDTH) / BURST.frameWidth);
    sprite.tint = color;
    sprite.visible = true;
  }

  /** Moves every burst on by `deltaSeconds`, hiding the ones played out. */
  update(deltaSeconds: number): void {
    for (const burst of this.bursts) {
      if (!burst.sprite.visible) continue;
      burst.age += deltaSeconds;
      const frame = this.frames[Math.floor(burst.age * BURST.fps)];
      if (frame) burst.sprite.texture = frame;
      else burst.sprite.visible = false;
    }
  }

  /** Clears the bursts still playing: a new song starts the picture over. */
  clear(): void {
    for (const burst of this.bursts) burst.sprite.visible = false;
  }
}
