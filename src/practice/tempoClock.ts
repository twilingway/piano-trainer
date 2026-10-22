import type { ClockSegment } from "./timing";

export interface TempoClockReceipt {
  readonly segments: readonly ClockSegment[];
  readonly atMs: number;
  readonly songTime: number;
  /** Musical zero projected from the current continuous clock, including count-in. */
  readonly startPerformanceMs: number | null;
  /** Musical end only after its actual crossing, independent of finished/input grace. */
  readonly endPerformanceMs: number | null;
  readonly ended: boolean;
}

function crossing(
  segments: readonly ClockSegment[],
  target: number,
  atMs: number,
  allowFuture: boolean
): number | null {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!segment || segment.speed <= 0 || segment.songSeconds > target) continue;
    const at = segment.performanceMs + ((target - segment.songSeconds) / segment.speed) * 1000;
    const next = segments[index + 1];
    if (next && at > next.performanceMs) continue;
    if (allowFuture || at <= atMs) return at;
  }
  return null;
}

/** Observe the session timeline without clipping it at pending notes or advancing another clock. */
export function tempoClockReceipt(
  anchors: readonly ClockSegment[],
  duration: number,
  fallbackTime: number,
  atMs: number
): TempoClockReceipt {
  const segments = anchors
    .filter((segment) => segment.performanceMs <= atMs)
    .map((segment) => ({ ...segment }));
  const last = segments.at(-1);
  const projected = last
    ? last.songSeconds + ((atMs - last.performanceMs) / 1000) * last.speed
    : fallbackTime;
  const endPerformanceMs = crossing(segments, duration, atMs, false);
  return {
    // The 65th anchor witnesses overflow; a shortened trace must never masquerade as complete.
    segments: segments.slice(0, 65),
    atMs,
    songTime: Math.min(duration, projected),
    startPerformanceMs: crossing(segments, 0, atMs, true),
    endPerformanceMs,
    ended: endPerformanceMs !== null
  };
}
