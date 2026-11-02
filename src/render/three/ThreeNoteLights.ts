import { Group, SpotLight } from "three";
import type { EnergySource } from "../noteEnergy";
import type { WorldCamera } from "../worldCamera";
import type { KeyBox } from "./keyBoxes";

export const NOTE_LIGHT_LIMIT = 8;
const LIGHT_POWER = 90000;
const MAX_LOCAL_ENERGY = 1.4;
const MAX_TOTAL_ENERGY = 4.5;

interface LightSample {
  pitch: number;
  x: number;
  y: number;
  z: number;
  red: number;
  green: number;
  blue: number;
  energy: number;
}

interface Candidate extends LightSample {
  readonly box: KeyBox;
  selected: boolean;
}

const emptySample = (): LightSample => ({
  pitch: 0,
  x: 0,
  y: 0,
  z: 0,
  red: 0,
  green: 0,
  blue: 0,
  energy: 0
});
const unit = (value: number): number => Math.max(0, Math.min(1, value));

/** Most of the light reaches the hands during the last third of the approach. */
export function noteLightEnergy(source: EnergySource): number {
  if (!Number.isFinite(source.strength) || !Number.isFinite(source.progress)) return 0;
  const progress = source.sounding ? 1 : unit(source.progress);
  const near = unit((progress - 0.7) / 0.3);
  const gain = 0.03 * progress ** 2 + 0.97 * near ** 2 * (3 - 2 * near);
  return Math.max(0, Math.min(MAX_LOCAL_ENERGY, source.strength)) * gain;
}

/**
 * Deterministic render math with reusable storage. No clocks, scene objects or per-frame arrays;
 * samples and candidates are allocated only when the keyboard layout changes.
 */
export class NoteLightSelection {
  readonly samples = Array.from({ length: NOTE_LIGHT_LIMIT }, emptySample);
  private candidates: Candidate[] = [];
  private readonly pitches = new Map<number, Candidate>();

  layout(boxes: readonly KeyBox[]): void {
    this.candidates = [...boxes]
      .sort((a, b) => a.pitch - b.pitch)
      .map((box) => ({ ...emptySample(), box, selected: false }));
    this.pitches.clear();
    for (const candidate of this.candidates) this.pitches.set(candidate.box.pitch, candidate);
    this.clear();
  }

  clear(): void {
    for (const sample of this.samples) sample.energy = 0;
  }

  update(sources: readonly EnergySource[], camera: WorldCamera): readonly LightSample[] {
    for (const candidate of this.candidates) {
      candidate.energy = 0;
      candidate.x = candidate.y = candidate.z = 0;
      candidate.red = candidate.green = candidate.blue = 0;
      candidate.selected = false;
    }
    for (const source of sources) {
      const candidate = this.pitches.get(source.pitch);
      const energy = noteLightEnergy(source);
      if (!candidate || energy === 0) continue;
      const progress = source.sounding ? 1 : unit(source.progress);
      // The sounding cone opens from the hit line towards the fingertips and the hand backs.
      const depth = source.sounding
        ? 145
        : camera.near.z + (1 - progress) * (camera.roadFarZ - camera.near.z);
      candidate.x += candidate.box.x * energy;
      candidate.y +=
        (source.sounding ? 160 : Math.max(camera.near.y, candidate.box.top) + 32) * energy;
      // Three stores the app's left-handed world with its Z axis reversed.
      candidate.z -= depth * energy;
      candidate.red += ((source.color >> 16) & 255) * energy;
      candidate.green += ((source.color >> 8) & 255) * energy;
      candidate.blue += (source.color & 255) * energy;
      candidate.energy += energy;
    }
    // Adjacent chromatic notes share a small pool of light, without collecting a whole chord
    // into a single distant emitter. Weighted coordinates and colours preserve both parts.
    let previous: Candidate | undefined;
    for (const candidate of this.candidates) {
      if (candidate.energy === 0) continue;
      if (
        previous &&
        candidate.box.pitch - previous.box.pitch <= 1 &&
        candidate.box.x - previous.box.x <=
          Math.max(candidate.box.width, previous.box.width) * 0.75 &&
        Math.abs(candidate.z / candidate.energy - previous.z / previous.energy) < 60
      ) {
        previous.x += candidate.x;
        previous.y += candidate.y;
        previous.z += candidate.z;
        previous.red += candidate.red;
        previous.green += candidate.green;
        previous.blue += candidate.blue;
        previous.energy += candidate.energy;
        candidate.energy = 0;
        previous = undefined;
      } else previous = candidate;
    }
    let total = 0;
    for (const sample of this.samples) {
      let best: Candidate | undefined;
      for (const candidate of this.candidates) {
        if (candidate.selected || candidate.energy === 0) continue;
        // Pitch order breaks ties, independently of the order of sources in the snapshot.
        if (!best || candidate.energy > best.energy) best = candidate;
      }
      sample.energy = 0;
      if (!best) continue;
      best.selected = true;
      const weight = best.energy;
      sample.pitch = best.box.pitch;
      sample.x = best.x / weight;
      sample.y = best.y / weight;
      sample.z = best.z / weight;
      sample.red = best.red / weight / 255;
      sample.green = best.green / weight / 255;
      sample.blue = best.blue / weight / 255;
      sample.energy = Math.min(MAX_LOCAL_ENERGY, weight);
      total += sample.energy;
    }
    const normalize = total > MAX_TOTAL_ENERGY ? MAX_TOTAL_ENERGY / total : 1;
    for (const sample of this.samples) sample.energy *= normalize;
    return this.samples;
  }
}

/** A fixed pool inherited by both the key meshes and the existing hand materials. */
export class ThreeNoteLights {
  readonly group = new Group();
  private readonly selection = new NoteLightSelection();
  private boxes = new Map<number, KeyBox>();
  private lastSources: readonly EnergySource[] = [];
  private lastCamera: WorldCamera | undefined;
  private lastScale = 1;
  private readonly lights = Array.from({ length: NOTE_LIGHT_LIMIT }, () => {
    const light = new SpotLight(0xffffff, 0, 420, 0.75, 0.9, 2);
    light.castShadow = false;
    light.add(light.target);
    this.group.add(light);
    return light;
  });

  /** `scale` is the keys group's scale: the lights live there, not on the world road. */
  layout(
    boxes: readonly KeyBox[],
    camera = this.lastCamera,
    scale = camera?.params.prefs.scale ?? this.lastScale
  ): void {
    const oldScale = this.lastScale;
    const retained = new Map<
      number,
      {
        intensity: number;
        relativeX: number;
        y: number;
        z: number;
        red: number;
        green: number;
        blue: number;
      }
    >();
    for (let index = 0; index < this.lights.length; index++) {
      const light = this.lights[index];
      const sample = this.selection.samples[index];
      const box = sample && this.boxes.get(sample.pitch);
      if (!light || !sample || !box || light.intensity <= 0) continue;
      retained.set(sample.pitch, {
        intensity: light.intensity / oldScale ** 2,
        relativeX: (light.position.x - box.x) / box.width,
        y: light.position.y,
        z: light.position.z,
        red: light.color.r,
        green: light.color.g,
        blue: light.color.b
      });
    }
    this.selection.layout(boxes);
    this.boxes = new Map(boxes.map((box) => [box.pitch, box]));
    const samples = camera
      ? this.selection.update(this.lastSources, camera)
      : this.selection.samples;
    this.lastCamera = camera;
    this.lastScale = scale;
    for (let index = 0; index < this.lights.length; index++) {
      const light = this.lights[index];
      const sample = samples[index];
      if (!light || !sample) continue;
      light.distance = 420 * scale;
      light.intensity = 0;
      if (sample.energy <= 0) continue;
      const saved = retained.get(sample.pitch);
      this.place(light, sample);
      light.intensity = (saved?.intensity ?? 0) * scale ** 2;
      retained.delete(sample.pitch);
    }
    // Preserve already fading visible lights too, without advancing their release envelope.
    const tails = retained.entries();
    for (let index = 0; index < this.lights.length; index++) {
      const light = this.lights[index];
      const sample = samples[index];
      if (!light || !sample || sample.energy > 0) continue;
      let tail = tails.next();
      while (!tail.done && !this.boxes.has(tail.value[0])) tail = tails.next();
      if (tail.done) break;
      const [pitch, saved] = tail.value;
      const box = this.boxes.get(pitch);
      if (!box) continue;
      sample.pitch = pitch;
      light.position.set(box.x + saved.relativeX * box.width, saved.y, saved.z);
      light.target.position.set(0, 55 - saved.y, 40 - saved.z);
      light.color.setRGB(saved.red, saved.green, saved.blue);
      light.intensity = saved.intensity * scale ** 2;
    }
  }

  /** Seek, song changes and effect resets discard light immediately, without a release tail. */
  clear(): void {
    this.lastSources = [];
    this.lastCamera = undefined;
    this.lastScale = 1;
    this.selection.clear();
    for (const light of this.lights) light.intensity = 0;
  }

  update(
    sources: readonly EnergySource[],
    camera: WorldCamera,
    deltaSeconds: number,
    scale = camera.params.prefs.scale
  ): void {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    if (delta === 0) return;
    this.lastSources = sources;
    this.lastCamera = camera;
    this.lastScale = scale;
    const samples = this.selection.update(sources, camera);
    for (let index = 0; index < this.lights.length; index++) {
      const light = this.lights[index];
      const sample = samples[index];
      if (!light || !sample) continue;
      light.distance = 420 * scale;
      const target = sample.energy * LIGHT_POWER * scale ** 2;
      if (sample.energy > 0) {
        this.place(light, sample);
      }
      const rate = target > light.intensity ? 35 : 16;
      light.intensity += (target - light.intensity) * (1 - Math.exp(-delta * rate));
      if (light.intensity < 0.01) light.intensity = 0;
    }
  }

  dispose(): void {
    this.clear();
    this.layout([]);
    for (const light of this.lights) {
      light.dispose();
      light.clear();
    }
    this.group.removeFromParent();
    this.group.clear();
  }

  private place(light: SpotLight, sample: LightSample): void {
    light.position.set(sample.x, sample.y, sample.z);
    light.target.position.set(0, 55 - sample.y, 40 - sample.z);
    light.color.setRGB(sample.red, sample.green, sample.blue);
  }
}
