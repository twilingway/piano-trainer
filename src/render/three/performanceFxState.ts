import type { EnergySource } from "../noteEnergy";
export interface PerformanceHit {
  time: number;
  pitch: number;
  color: number;
  strength: number;
}
export const PERFORMANCE_HIT_CAPACITY = 64;

/** Accepted-note ids emit once. Only the existing session time ages the bounded burst pool. */
export class PerformanceFxState {
  readonly hits: PerformanceHit[] = Array.from({ length: PERFORMANCE_HIT_CAPACITY }, () => ({
    time: -Infinity,
    pitch: -1,
    color: 0,
    strength: 0
  }));
  private readonly emitted = new Set<string>();
  private readonly activeIds = new Set<string>();
  private cursor = 0;
  private lastTime: number | undefined;

  update(time: number, sources: readonly EnergySource[]): void {
    if (!Number.isFinite(time)) return;
    if (this.lastTime !== undefined && (time < this.lastTime - 1e-6 || time - this.lastTime > 2))
      this.clear();
    this.lastTime = time;
    this.activeIds.clear();
    for (const source of sources) this.activeIds.add(source.id);
    for (const id of this.emitted) if (!this.activeIds.has(id)) this.emitted.delete(id);
    for (const source of sources) {
      if (!source.sounding || this.emitted.has(source.id)) continue;
      this.emitted.add(source.id);
      const hit = this.hits[this.cursor];
      if (hit) {
        hit.time = time;
        hit.pitch = source.pitch;
        hit.color = source.color;
        hit.strength = Math.max(0, Math.min(1, source.strength));
      }
      this.cursor = (this.cursor + 1) % this.hits.length;
    }
  }
  clear(): void {
    this.emitted.clear();
    this.cursor = 0;
    this.lastTime = undefined;
    for (const hit of this.hits) hit.time = -Infinity;
  }
}
export function performanceAtlasFrame(
  time: number,
  fps: number,
  frames: number,
  phase = 0
): number {
  if (!Number.isFinite(time) || fps <= 0 || frames < 1) return 0;
  return ((Math.floor(time * fps + phase) % frames) + frames) % frames;
}
