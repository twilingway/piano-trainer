import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { emberAt, emberRateForHold, emberSizeForDuration } from "./emberMotion";
import type { EmberPosition } from "./emberMotion";
import { MistBoundsMask } from "./MistBoundsMask";
import type { EnergySource } from "./noteEnergy";

export interface PlasmaAnchor {
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly color: number;
  readonly black?: boolean;
}

const KEYS = 88;
const RIM_LAYERS = 2;
const EMBERS = 128;
const FRAME_WIDTH = 144;
const FRAME_HEIGHT = 192;
const FRAME_COUNT = 96;
const ATLAS_COLUMNS = 8;
const FPS = 24;
const MIST_FRAME_WIDTH = 192;
const MIST_FRAME_HEIGHT = 96;
const MIST_FPS = 16;
const FLAME_URL = new URL("../fx/plasma-flame.webp", import.meta.url).href;
const MIST_URL = new URL("../fx/piano-mist.webp", import.meta.url).href;
const EMBER_URL = new URL("../fx/plasma-note.svg", import.meta.url).href;

interface Flame {
  readonly sprite: Sprite;
  readonly halo: Sprite;
  pitch: number;
  intensity: number;
  target: number;
  color: number;
  weight: number;
  red: number;
  green: number;
  blue: number;
  originStrength: number;
  emitColor: number;
  durationScale: number;
  whiteWidth: number;
  heldAge: number;
  originId: string | undefined;
  emissionId: string | undefined;
  emitCredit: number;
}

interface Ember {
  readonly sprite: Sprite;
  pitch: number;
  seed: number;
  age: number;
  offset: number;
  size: number;
}

function spriteIn(
  container: Container,
  anchorY: number,
  blendMode: "normal" | "screen" | "add" = "normal"
): Sprite {
  const sprite = new Sprite(Texture.EMPTY);
  sprite.anchor.set(0.5, anchorY);
  sprite.blendMode = blendMode;
  sprite.visible = false;
  container.addChild(sprite);
  return sprite;
}

function atlasFrames(atlas: Texture, width: number, height: number): Texture[] {
  return Array.from(
    { length: FRAME_COUNT },
    (_, index) =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle(
          (index % ATLAS_COLUMNS) * width,
          Math.floor(index / ATLAS_COLUMNS) * height,
          width,
          height
        )
      })
  );
}

/** Overlapping horizon mist, colored held flames and rising musical embers. */
export class PlasmaLayer {
  readonly container = new Container();
  private readonly rimContainer = new Container();
  private readonly haloContainer = new Container();
  private readonly flameContainer = new Container();
  private readonly emberContainer = new Container();
  private readonly rims: Sprite[] = [];
  private readonly flames: Flame[] = [];
  private readonly embers: Ember[] = [];
  private readonly anchors = new Map<number, PlasmaAnchor>();
  private readonly attacked = new Set<string>();
  private readonly point: EmberPosition = {
    x: 0,
    y: 0,
    alpha: 0,
    scale: 0,
    alive: false,
    rotation: 0,
    axisScale: 1
  };
  private frames: Texture[] = [];
  private mistFrames: Texture[] = [];
  private emberTexture?: Texture;
  private loading?: Promise<void>;
  private disposed = false;
  private mistMask: MistBoundsMask | undefined;
  private clock = 0;
  private serial = 0;
  private nextEmber = 0;

  constructor() {
    this.container.eventMode = "none";
    this.container.addChild(
      this.emberContainer,
      this.rimContainer,
      this.haloContainer,
      this.flameContainer
    );
    for (let index = 0; index < KEYS; index++) {
      for (let layer = 0; layer < RIM_LAYERS; layer++) {
        this.rims.push(spriteIn(this.rimContainer, 0.8125, "screen"));
      }
      this.flames.push({
        sprite: spriteIn(this.flameContainer, 0.88, "screen"),
        halo: spriteIn(this.haloContainer, 0.88, "screen"),
        pitch: -1,
        intensity: 0,
        target: 0,
        color: 0xffffff,
        weight: 0,
        red: 0,
        green: 0,
        blue: 0,
        originStrength: 0,
        emitColor: 0xffffff,
        durationScale: 1,
        whiteWidth: 0,
        heldAge: 0,
        originId: undefined,
        emissionId: undefined,
        emitCredit: 0
      });
    }
    for (let index = 0; index < EMBERS; index++) {
      this.embers.push({
        sprite: spriteIn(this.emberContainer, 0.5),
        pitch: -1,
        seed: 0,
        age: 0,
        offset: 0,
        size: 1
      });
    }
  }

  /** The neutral rim keeps its ownership here while the native host draws it behind the piano. */
  get mist(): Container {
    return this.rimContainer;
  }

  load(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return (this.loading ??= this.loadAssets());
  }

  private async loadAssets(): Promise<void> {
    const [flame, mist, ember] = await Promise.allSettled([
      Assets.load<Texture>(FLAME_URL),
      Assets.load<Texture>(MIST_URL),
      Assets.load<Texture>(EMBER_URL)
    ]);
    if (this.disposed) return;
    if (flame.status === "fulfilled") {
      this.frames = atlasFrames(flame.value, FRAME_WIDTH, FRAME_HEIGHT);
    }
    if (mist.status === "fulfilled")
      this.mistFrames = atlasFrames(mist.value, MIST_FRAME_WIDTH, MIST_FRAME_HEIGHT);
    if (ember.status === "fulfilled") this.emberTexture = ember.value;
  }

  draw(
    anchors: readonly PlasmaAnchor[],
    sources: readonly EnergySource[],
    attacks: readonly EnergySource[],
    height: number,
    deltaSeconds: number,
    clipMist = false,
    mistOffsetX = 0
  ): void {
    if (this.disposed) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.min(0.05, Math.max(0, deltaSeconds)) : 0;
    this.clock += delta;
    this.anchors.clear();
    for (const anchor of anchors) this.anchors.set(anchor.pitch, anchor);
    if (clipMist) this.mistMask ??= new MistBoundsMask(this.rimContainer);
    this.mistMask?.update(anchors, height, clipMist, mistOffsetX);
    this.drawRim(anchors, height);
    for (const flame of this.flames) {
      flame.target = 0;
      flame.weight = 0;
      flame.red = 0;
      flame.green = 0;
      flame.blue = 0;
      flame.originStrength = 0;
      flame.originId = undefined;
    }
    let soundingCount = 0;
    for (const source of sources) if (source.sounding) soundingCount++;
    const strengthScale = 1 / Math.sqrt(1 + Math.max(0, soundingCount - 1) * 0.3);
    for (const source of sources) if (source.sounding) this.spread(source, strengthScale);
    if (delta > 0) {
      for (const attack of attacks) {
        if (!attack.sounding || this.attacked.has(attack.id)) continue;
        this.attacked.add(attack.id);
        const anchor = this.anchors.get(attack.pitch);
        if (anchor) this.emit(anchor, attack.color, 2, emberSizeForDuration(attack.duration));
      }
    }
    this.drawFlames(delta, height);
    this.drawEmbers(height, delta);
  }

  private spread(source: EnergySource, strengthScale: number): void {
    const origin = this.anchors.get(source.pitch);
    if (!origin) return;
    let whiteWidth = origin.width;
    let nearest = Infinity;
    for (const anchor of this.anchors.values()) {
      const distance = Math.abs(anchor.x - origin.x);
      if (!anchor.black && distance < nearest) {
        nearest = distance;
        whiteWidth = anchor.width;
      }
    }
    if (whiteWidth <= 0) return;
    for (const anchor of this.anchors.values()) {
      if (anchor.black && anchor.pitch !== source.pitch) continue;
      const distance = Math.abs(anchor.x - origin.x) / whiteWidth;
      const tail = Math.min(1, Math.max(0, (distance - 3) / 0.75));
      const taper = 1 - tail * tail * (3 - 2 * tail);
      const amplitude = distance < 3.75 ? Math.exp(-0.5 * (distance / 1.45) ** 2) * taper : 0;
      const weight = Math.max(0, source.strength) * strengthScale * amplitude;
      if (weight <= 0) continue;
      const flame =
        this.flames.find((candidate) => candidate.pitch === anchor.pitch) ??
        this.flames.find((candidate) => candidate.intensity < 0.005 && candidate.target === 0);
      if (!flame) continue;
      if (flame.pitch !== anchor.pitch) {
        flame.pitch = anchor.pitch;
        flame.emitCredit = 0;
        flame.emissionId = undefined;
      }
      flame.target = Math.min(1, flame.target + weight);
      flame.whiteWidth = whiteWidth;
      flame.weight += weight;
      flame.red += ((source.color >>> 16) & 255) * weight;
      flame.green += ((source.color >>> 8) & 255) * weight;
      flame.blue += (source.color & 255) * weight;
      flame.color =
        (Math.round(flame.red / flame.weight) << 16) |
        (Math.round(flame.green / flame.weight) << 8) |
        Math.round(flame.blue / flame.weight);
      if (anchor.pitch === source.pitch) {
        flame.originStrength = Math.min(1, flame.originStrength + source.strength);
        flame.emitColor = source.color;
        flame.durationScale = emberSizeForDuration(source.duration);
        flame.originId = source.id;
      }
    }
  }

  private drawRim(anchors: readonly PlasmaAnchor[], height: number): void {
    const hasMist = this.mistFrames.length > 0;
    const frames = hasMist ? this.mistFrames : this.frames;
    const fps = hasMist ? MIST_FPS : FPS;
    let count = 0;
    let whiteCount = 0;
    for (const anchor of anchors) if (!anchor.black) whiteCount++;
    let whiteIndex = 0;
    for (const anchor of anchors) {
      if (anchor.black || count >= KEYS * RIM_LAYERS) continue;
      const index = whiteIndex++;
      if (index % 3 !== 0 && index !== whiteCount - 1) continue;
      const primaryHeight = Math.min(
        Math.max(0, height) * 0.5,
        anchor.width * (2.7 + 0.6 * Math.sin(this.clock * 0.21 + anchor.pitch * 2.399963))
      );
      for (let layer = 0; layer < RIM_LAYERS; layer++) {
        const sprite = this.rims[count++];
        if (!sprite) continue;
        const phase = anchor.pitch * 2.399963 + layer * 1.731;
        const speed = 1 + Math.sin(phase * 1.37) * 0.08;
        const frame = Math.floor(this.clock * fps * speed + (anchor.pitch * 17 + layer * 43));
        const texture = frames[frame % FRAME_COUNT];
        sprite.visible = texture !== undefined;
        if (!texture) continue;
        const drift =
          Math.sin(this.clock * 0.29 + phase) * 0.38 +
          Math.sin(this.clock * 0.443 - phase * 0.71) * 0.22;
        sprite.texture = texture;
        sprite.anchor.y = hasMist ? 0.8125 : 0.88;
        sprite.position.set(
          anchor.x + anchor.width * drift,
          anchor.y + anchor.width * 0.04 * Math.sin(this.clock * 0.31 + phase)
        );
        sprite.width = anchor.width * (7 + 0.5 * Math.sin(this.clock * 0.25 + phase));
        sprite.height = primaryHeight * (layer === 0 ? 1 : 0.24);
        sprite.skew.x = 0.06 * Math.sin(this.clock * 0.21 + phase * 0.79);
        sprite.tint = layer === 0 ? 0xd5dce0 : 0xb9c1c8;
        sprite.alpha = layer === 0 ? 0.42 : 0.72;
      }
    }
    for (let index = count; index < this.rims.length; index++) {
      const rim = this.rims[index];
      if (rim) rim.visible = false;
    }
  }

  private drawFlames(delta: number, height: number): void {
    for (let index = 0; index < this.flames.length; index++) {
      const flame = this.flames[index];
      if (!flame) continue;
      const response = flame.target > flame.intensity ? 20 : 1.2;
      flame.intensity += (flame.target - flame.intensity) * (1 - Math.exp(-response * delta));
      const anchor = this.anchors.get(flame.pitch);
      const texture = this.frames[(Math.floor(this.clock * FPS) + index * 5) % FRAME_COUNT];
      flame.sprite.visible = !!anchor && !!texture && flame.intensity > 0.005;
      flame.halo.visible = flame.sprite.visible;
      if (!anchor) continue;
      if (delta > 0 && flame.emissionId !== flame.originId) {
        flame.emitCredit = 0;
        flame.heldAge = 0;
        flame.emissionId = flame.originId;
      }
      if (delta > 0 && flame.originStrength > 0) {
        flame.heldAge += delta;
        flame.emitCredit += emberRateForHold(flame.heldAge) * delta;
        const count = Math.min(4, Math.floor(flame.emitCredit));
        if (count > 0) {
          this.emit(anchor, flame.emitColor, count, flame.durationScale);
          flame.emitCredit = Math.min(1, flame.emitCredit - count);
        }
      }
      if (!texture || !flame.sprite.visible) continue;
      const sprite = flame.sprite;
      sprite.texture = texture;
      const phase = flame.pitch * 2.399963;
      sprite.position.set(
        anchor.x + anchor.width * 0.08 * Math.sin(this.clock * 1.31 + phase),
        anchor.y
      );
      sprite.width = flame.whiteWidth * 1.8;
      sprite.height =
        Math.min(Math.max(0, height) * 0.7, flame.whiteWidth * 3.6 * 3.5) *
        0.65 *
        flame.intensity *
        (0.98 + 0.02 * Math.sin(this.clock * 2.17 + phase));
      sprite.tint = flame.color;
      sprite.alpha = flame.intensity * 0.95;
      const halo = flame.halo;
      halo.texture = texture;
      halo.position.copyFrom(sprite.position);
      halo.width = sprite.width * 1.35;
      halo.height = sprite.height * 1.05;
      halo.tint = flame.color;
      halo.alpha = flame.intensity * 0.24;
    }
  }

  private emit(anchor: PlasmaAnchor, color: number, count: number, durationScale: number): void {
    if (!this.emberTexture) return;
    for (let index = 0; index < count; index++) {
      let ember: Ember | undefined;
      for (let attempt = 0; attempt < EMBERS; attempt++) {
        const candidate = this.embers[this.nextEmber];
        this.nextEmber = (this.nextEmber + 1) % EMBERS;
        if (candidate && !candidate.sprite.visible) {
          ember = candidate;
          break;
        }
      }
      if (!ember) return;
      ember.seed = ++this.serial;
      ember.pitch = anchor.pitch;
      ember.age = 0;
      ember.offset = ((ember.seed * 0.61803398875) % 1) - 0.5;
      ember.size = (0.55 + ((ember.seed * 0.41421356237) % 1) * 1.1) * durationScale;
      ember.sprite.texture = this.emberTexture;
      ember.sprite.tint = color;
      ember.sprite.visible = true;
    }
  }

  private drawEmbers(height: number, delta: number): void {
    for (const ember of this.embers) {
      if (!ember.sprite.visible) continue;
      const anchor = this.anchors.get(ember.pitch);
      ember.age += delta;
      const point = emberAt(ember.seed, ember.age, height, (anchor?.width ?? 0) * 5, this.point);
      ember.sprite.visible = !!anchor && point.alive;
      if (!anchor || !point.alive) continue;
      ember.sprite.position.set(
        anchor.x + (ember.offset * anchor.width + point.x),
        anchor.y + point.y
      );
      // The baked glow has a small luminous core; enlarge its transparent footprint accordingly.
      const size = Math.min(34, Math.max(12, ember.size * point.scale * 14.4));
      ember.sprite.width = size * 0.8;
      ember.sprite.height = size;
      ember.sprite.rotation = point.rotation;
      ember.sprite.scale.x = Math.abs(ember.sprite.scale.x) * point.axisScale;
      ember.sprite.alpha = Math.min(1, point.alpha * 1.15);
    }
  }

  clear(): void {
    this.clock = 0;
    this.attacked.clear();
    this.anchors.clear();
    for (const rim of this.rims) rim.visible = false;
    for (const flame of this.flames) {
      flame.sprite.visible = false;
      flame.halo.visible = false;
      flame.intensity = 0;
      flame.target = 0;
      flame.emitCredit = 0;
      flame.heldAge = 0;
      flame.originId = undefined;
      flame.emissionId = undefined;
      flame.pitch = -1;
    }
    for (const ember of this.embers) ember.sprite.visible = false;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.mistMask?.destroy();
    this.mistMask = undefined;
    this.container.destroy({ children: true, texture: false, textureSource: false });
    for (const frame of this.frames) frame.destroy(false);
    for (const frame of this.mistFrames) frame.destroy(false);
    this.frames = [];
    this.mistFrames = [];
  }
}
