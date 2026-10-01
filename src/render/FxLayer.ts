import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

/** An atlas baked by Arcadia Effector (src/fx), with the numbers the editor exported. */
interface AtlasEffect {
  readonly url: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly cols: number;
  readonly frames: number;
  readonly fps: number;
  /** Where the key's point is in a frame, as a share of its height. */
  readonly anchorY: number;
  /** The effect's width on screen, in key widths. */
  readonly perKeyWidth: number;
  /** At most this many playing at once; a full pool reuses the oldest. */
  readonly pool: number;
}

/** A flash and a spray of sparks when a key is struck (src/fx/piano-hit.json). */
const HIT: AtlasEffect = {
  url: new URL("../fx/piano-hit.webp", import.meta.url).href,
  frameWidth: 160,
  frameHeight: 160,
  cols: 4,
  frames: 12,
  fps: 24,
  // The effect's origin sits 50 of 384 below the middle of its frame.
  anchorY: 0.5 + 50 / 384,
  perKeyWidth: 6,
  pool: 24
};
/** Glitter, wisps and haze whirling up off a sounding key (src/fx/piano-glitter.json). */
const GLITTER: AtlasEffect = {
  url: new URL("../fx/piano-glitter.webp", import.meta.url).href,
  frameWidth: 144,
  frameHeight: 192,
  cols: 6,
  frames: 24,
  fps: 15,
  // The emitter sits 200 of 512 below the middle of its frame.
  anchorY: 0.5 + 200 / 512,
  perKeyWidth: 3.6,
  pool: 160
};
/** A held key sends up a new puff of glitter this often, so the column never breaks. */
const GLITTER_EVERY_S = 0.16;
/** The hold's light and glitter wait this long after the strike, so the burst is seen first. */
const HOLD_AFTER_S = 0.3;
/** The light on a sounding key: its size in key widths, and how it breathes. */
const HALO_PER_WIDTH = 2.6;
const HALO_PULSE = 0.08;
const HALO_PULSE_HZ = 2.2;

interface Playing {
  readonly sprite: Sprite;
  age: number;
}

/** Plays one atlas effect anywhere, as many times at once as its pool allows. */
class AtlasPlayer {
  readonly container = new Container();
  private frames: Texture[] = [];
  private readonly playing: Playing[] = [];

  constructor(private readonly effect: AtlasEffect) {}

  /** Loads the atlas; a failure leaves the player silent rather than the view broken. */
  async load(): Promise<void> {
    const effect = this.effect;
    try {
      const atlas = await Assets.load<Texture>(effect.url);
      this.frames = Array.from(
        { length: effect.frames },
        (_, index) =>
          new Texture({
            source: atlas.source,
            frame: new Rectangle(
              (index % effect.cols) * effect.frameWidth,
              Math.floor(index / effect.cols) * effect.frameHeight,
              effect.frameWidth,
              effect.frameHeight
            )
          })
      );
    } catch (error) {
      console.warn(`The effect ${effect.url} did not load; playing without it`, error);
    }
  }

  play(x: number, y: number, keyWidth: number, color: number): void {
    const first = this.frames[0];
    if (!first) return;
    let item = this.playing.find((candidate) => !candidate.sprite.visible);
    if (!item && this.playing.length >= this.effect.pool) {
      item = this.playing.reduce((oldest, candidate) =>
        candidate.age > oldest.age ? candidate : oldest
      );
    }
    if (!item) {
      const sprite = new Sprite(first);
      sprite.anchor.set(0.5, this.effect.anchorY);
      sprite.blendMode = "add";
      this.container.addChild(sprite);
      item = { sprite, age: 0 };
      this.playing.push(item);
    }
    item.age = 0;
    const sprite = item.sprite;
    sprite.texture = first;
    sprite.position.set(x, y);
    sprite.scale.set((keyWidth * this.effect.perKeyWidth) / this.effect.frameWidth);
    sprite.tint = color;
    sprite.visible = true;
  }

  update(deltaSeconds: number): void {
    for (const item of this.playing) {
      if (!item.sprite.visible) continue;
      item.age += deltaSeconds;
      const frame = this.frames[Math.floor(item.age * this.effect.fps)];
      if (frame) item.sprite.texture = frame;
      else item.sprite.visible = false;
    }
  }

  clear(): void {
    for (const item of this.playing) item.sprite.visible = false;
  }
}

/** A key on the hit line: which, where across the view, how wide, in what colour. */
export interface FxKey {
  readonly pitch: number;
  readonly x: number;
  readonly width: number;
  readonly color: number;
}

/**
 * The effects on the keys at the hit line: a burst when a key is struck, and
 * while it sounds a light breathing on it and glitter rising off it, as if the
 * note burnt away there. The light is a soft round glow drawn once; the burst
 * and the glitter are Arcadia atlases, white so a tint gives the finger's
 * colour.
 */
export class FxLayer {
  readonly container = new Container();
  private readonly hit = new AtlasPlayer(HIT);
  private readonly glitter = new AtlasPlayer(GLITTER);
  private readonly halos = new Container();
  private readonly haloTexture = bakeHalo();
  /** Each sounding key's light, kept while it sounds. */
  private readonly lights = new Map<number, { readonly glow: Sprite; readonly core: Sprite }>();
  /** Seconds until each sounding key sends up its next puff of glitter. */
  private readonly puffs = new Map<number, number>();
  /** How long each sounding key has sounded. */
  private readonly held = new Map<number, number>();
  private clock = 0;

  constructor() {
    this.container.eventMode = "none";
    this.container.addChild(this.glitter.container, this.halos, this.hit.container);
  }

  async load(): Promise<void> {
    await Promise.all([this.hit.load(), this.glitter.load()]);
  }

  /** One frame: bursts on `struck`, light and glitter on `sounding`, on the line at `hitY`. */
  draw(
    struck: readonly FxKey[],
    sounding: readonly FxKey[],
    hitY: number,
    deltaSeconds: number
  ): void {
    this.clock += deltaSeconds;
    for (const key of struck) this.hit.play(key.x, hitY, key.width, key.color);
    const stillSounding = new Set<number>();
    for (const key of sounding) {
      const heldFor = (this.held.get(key.pitch) ?? 0) + deltaSeconds;
      this.held.set(key.pitch, heldFor);
      if (heldFor < HOLD_AFTER_S) continue;
      stillSounding.add(key.pitch);
      const due = (this.puffs.get(key.pitch) ?? 0) - deltaSeconds;
      if (due <= 0) this.glitter.play(key.x, hitY, key.width, key.color);
      this.puffs.set(key.pitch, due <= 0 ? due + GLITTER_EVERY_S : due);
      this.light(key, hitY);
    }
    for (const pitch of [...this.puffs.keys()]) {
      if (!stillSounding.has(pitch)) this.puffs.delete(pitch);
    }
    const soundingNow = new Set(sounding.map((key) => key.pitch));
    for (const pitch of [...this.held.keys()]) {
      if (!soundingNow.has(pitch)) this.held.delete(pitch);
    }
    for (const [pitch, light] of this.lights) {
      const on = stillSounding.has(pitch);
      light.glow.visible = on;
      light.core.visible = on;
    }
    this.hit.update(deltaSeconds);
    this.glitter.update(deltaSeconds);
  }

  clear(): void {
    this.hit.clear();
    this.glitter.clear();
    this.puffs.clear();
    this.held.clear();
    for (const light of this.lights.values()) {
      light.glow.visible = false;
      light.core.visible = false;
    }
  }

  private light(key: FxKey, hitY: number): void {
    let light = this.lights.get(key.pitch);
    if (!light) {
      const glow = new Sprite(this.haloTexture);
      const core = new Sprite(this.haloTexture);
      for (const sprite of [glow, core]) {
        sprite.anchor.set(0.5);
        sprite.blendMode = "add";
        this.halos.addChild(sprite);
      }
      light = { glow, core };
      this.lights.set(key.pitch, light);
    }
    const breath = 1 + HALO_PULSE * Math.sin(this.clock * Math.PI * 2 * HALO_PULSE_HZ);
    const size = (key.width * HALO_PER_WIDTH * breath) / this.haloTexture.width;
    light.glow.tint = key.color;
    light.glow.scale.set(size);
    light.glow.position.set(key.x, hitY);
    // A white-hot middle, a third of the glow.
    light.core.tint = 0xffffff;
    light.core.scale.set(size * 0.34);
    light.core.position.set(key.x, hitY);
  }
}

/** A soft round light, white for a tint: a bright middle fading to nothing at the edge. */
function bakeHalo(): Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.75)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.22)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}
