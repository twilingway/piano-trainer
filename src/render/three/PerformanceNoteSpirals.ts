import { Group } from "three";
import type { Camera } from "three";
import { WorldAtlasBatch } from "./WorldAtlasBatch";

export const PERFORMANCE_NOTE_SPIRAL_CAPACITY = 256;
export const PERFORMANCE_NOTE_SPIRAL_LIFE = 3.6;
export const PERFORMANCE_NOTE_SPIRAL_GLYPHS = 5;
const COPIES = 3;
const DELAY = 0.08;
const WINDOW = PERFORMANCE_NOTE_SPIRAL_LIFE + (COPIES - 1) * DELAY;

export interface PerformanceNoteSpiralEvent {
  readonly time: number;
  readonly pitch: number;
  readonly color: number;
  readonly strength: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}
export interface PerformanceNoteSpiralParticle {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  alpha: number;
  glowAlpha: number;
  rotation: number;
  life: number;
  glyph: number;
  alive: boolean;
}
const particle = (): PerformanceNoteSpiralParticle => ({
  x: 0,
  y: 0,
  z: 0,
  width: 0,
  height: 0,
  alpha: 0,
  glowAlpha: 0,
  rotation: 0,
  life: 0,
  glyph: 0,
  alive: false
});
const smooth = (x: number) => {
  const p = Math.max(0, Math.min(1, x));
  return p * p * (3 - 2 * p);
};
const valid = (event: PerformanceNoteSpiralEvent) =>
  Number.isFinite(event.time) &&
  Number.isInteger(event.pitch) &&
  event.pitch >= 21 &&
  event.pitch <= 108 &&
  Number.isFinite(event.color) &&
  Number.isFinite(event.strength) &&
  event.strength > 0 &&
  Number.isFinite(Math.fround(event.position.x)) &&
  Number.isFinite(Math.fround(event.position.y)) &&
  Number.isFinite(Math.fround(event.position.z));

const random = (seed: number, channel: number): number => {
  let n = Math.imul(seed ^ Math.imul(channel, 0x9e3779b9), 0x85ebca6b);
  n ^= n >>> 13;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Only source time and immutable event values determine this world-space trajectory. */
export function performanceNoteSpiralAt(
  event: PerformanceNoteSpiralEvent,
  time: number,
  unit: number,
  copy: number,
  out: PerformanceNoteSpiralParticle = particle()
): PerformanceNoteSpiralParticle {
  out.x = out.y = out.z = out.width = out.height = out.alpha = 0;
  out.glowAlpha = out.rotation = out.life = out.glyph = 0;
  out.alive = false;
  const age = time - event.time - copy * DELAY;
  if (
    !valid(event) ||
    !Number.isFinite(time) ||
    !Number.isFinite(unit) ||
    unit <= 0 ||
    !Number.isInteger(copy) ||
    copy < 0 ||
    copy >= COPIES ||
    age < 0
  )
    return out;
  const seed = (Math.imul(event.pitch, 73856093) ^ Math.floor(event.time * 1000)) >>> 0;
  const own = seed ^ Math.imul(copy + 1, 19349663);
  const life = 3 + 0.6 * random(own, 1);
  if (age >= life - 1e-9) return out;
  const p = age / life;
  const phase = random(own, 2) * Math.PI * 2;
  const angle = phase + (seed % 2 ? 1 : -1) * p * Math.PI * 2 * (1.15 + random(own, 3) * 0.7);
  const radius = 80 + 140 * smooth(p);
  out.x = event.position.x + (Math.cos(angle) * radius - Math.cos(phase) * 80) * unit;
  out.y = event.position.y + 2000 * unit * (1 - (1 - p) ** (1.05 + 0.25 * random(own, 4)));
  out.z = event.position.z + (Math.sin(angle) * radius - Math.sin(phase) * 80) * unit;
  const pulse = 0.5 + 0.5 * Math.sin(phase + age * (5 + 3 * random(own, 5)));
  const size = copy === 0 ? 24 : copy === 1 ? 39 : 60;
  out.width =
    size * (0.93 + 0.14 * random(own, 6)) * unit * (1 - 0.8 * smooth((age - 0.12) / (life - 0.12)));
  out.height = (out.width * 80) / 64;
  const envelope =
    Math.min(1, event.strength) * smooth(age / 0.12) * (1 - smooth((p - 1 / 3) * 1.5));
  out.alpha = 0.88 * envelope * (0.85 + 0.15 * pulse);
  out.glowAlpha = 0.11 * envelope * (0.6 + 0.4 * pulse);
  out.rotation =
    (random(own, 7) - 0.5) * 0.8 +
    (random(own, 8) > 0.5 ? 1 : -1) * age * (0.7 + 1.1 * random(own, 9)) +
    0.18 * Math.sin(angle);
  out.life = life;
  out.glyph = Math.floor(random(own, 10) * PERFORMANCE_NOTE_SPIRAL_GLYPHS);
  out.alive = true;
  return out;
}

const compare = (a: PerformanceNoteSpiralEvent, b: PerformanceNoteSpiralEvent) =>
  a.time - b.time ||
  a.pitch - b.pitch ||
  a.position.x - b.position.x ||
  a.position.y - b.position.y ||
  a.position.z - b.position.z;

/** Two fixed glyph batches share detached keyboard origins; no particle owns a mesh or texture. */
export class PerformanceNoteSpirals {
  private readonly batch = new WorldAtlasBatch(
    {
      url: new URL("../../fx/piano-music-glyphs.svg", import.meta.url).href,
      columns: PERFORMANCE_NOTE_SPIRAL_GLYPHS,
      rows: 1,
      frames: PERFORMANCE_NOTE_SPIRAL_GLYPHS,
      fps: 1,
      anchorY: 0.5,
      additive: false
    },
    PERFORMANCE_NOTE_SPIRAL_CAPACITY
  );
  private readonly glow = new WorldAtlasBatch(
    {
      url: new URL("../../fx/piano-music-glyphs.svg", import.meta.url).href,
      columns: PERFORMANCE_NOTE_SPIRAL_GLYPHS,
      rows: 1,
      frames: PERFORMANCE_NOTE_SPIRAL_GLYPHS,
      fps: 1,
      anchorY: 0.5
    },
    PERFORMANCE_NOTE_SPIRAL_CAPACITY
  );
  readonly group = new Group();
  constructor() {
    this.group.add(this.glow.group, this.batch.group);
  }
  private readonly events = Array.from(
    { length: Math.floor(PERFORMANCE_NOTE_SPIRAL_CAPACITY / COPIES) },
    () => ({
      time: -Infinity,
      pitch: 0,
      color: 0,
      strength: 0,
      position: { x: 0, y: 0, z: 0 }
    })
  );
  private readonly point = particle();
  private camera: Camera | undefined;
  private lastTime: number | undefined;
  private unit = 1;
  private disposed = false;
  get ready(): boolean {
    return this.batch.ready && this.glow.ready;
  }

  update(
    time: number,
    events: readonly PerformanceNoteSpiralEvent[],
    camera: Camera,
    unit: number
  ): void {
    if (this.disposed) return;
    this.camera = camera;
    if (!Number.isFinite(time) || !Number.isFinite(unit) || unit <= 0) {
      this.clear();
      return;
    }
    if ((this.lastTime !== undefined && time < this.lastTime - 1e-6) || unit !== this.unit)
      this.clear();
    this.unit = unit;
    this.lastTime = time;
    for (const stored of this.events) if (time - stored.time >= WINDOW) stored.time = -Infinity;
    for (const event of events) {
      if (!valid(event) || time < event.time || time - event.time >= WINDOW) continue;
      let slot = this.events[0];
      if (!slot) break;
      let found = false;
      for (const candidate of this.events) {
        if (compare(candidate, event) === 0) {
          slot = candidate;
          found = true;
          break;
        }
        if (compare(candidate, slot) < 0) slot = candidate;
      }
      // Keep the newest bounded event set independent of input ordering or repeated pause frames.
      if (!found && compare(event, slot) <= 0) continue;
      slot.time = event.time;
      slot.pitch = event.pitch;
      slot.color = event.color;
      slot.strength = event.strength;
      slot.position.x = event.position.x;
      slot.position.y = event.position.y;
      slot.position.z = event.position.z;
    }
    this.batch.begin(camera);
    this.glow.begin(camera);
    for (const event of this.events) {
      if (!Number.isFinite(event.time)) continue;
      for (let copy = 0; copy < COPIES; copy++) {
        const p = performanceNoteSpiralAt(event, time, unit, copy, this.point);
        if (p.alive) {
          this.batch.add(
            p.x,
            p.y,
            p.z,
            p.width,
            p.height,
            event.color,
            p.alpha,
            p.glyph,
            1.08,
            p.rotation
          );
          this.glow.add(
            p.x,
            p.y,
            p.z,
            p.width * 1.65,
            p.height * 1.65,
            event.color,
            p.glowAlpha,
            p.glyph,
            0.85,
            p.rotation
          );
        }
      }
    }
    this.batch.end();
    this.glow.end();
    this.group.visible = this.batch.group.visible || this.glow.group.visible;
  }
  clear(): void {
    for (const event of this.events) event.time = -Infinity;
    this.lastTime = undefined;
    if (this.camera && !this.disposed) {
      this.batch.begin(this.camera);
      this.batch.end();
      this.glow.begin(this.camera);
      this.glow.end();
    }
    this.group.visible = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.camera = undefined;
    this.batch.dispose();
    this.glow.dispose();
    this.group.clear();
  }
}
