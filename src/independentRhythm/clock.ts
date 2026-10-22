const array = (value: unknown): boolean => Array.isArray(value);
import type { ClockSegment } from "../practice/timing";
import type { IndependentRhythmClockReceipt } from "./types";

const EPSILON = 1e-8;
export function rhythmClockAt(
  segments: readonly ClockSegment[],
  atMs: number,
  input = true
): number | undefined {
  const segment = segments.findLast((item) => item.performanceMs <= atMs);
  if (!segment || (input && (!segment.acceptsInput || segment.speed !== 1))) return undefined;
  return segment.songSeconds + ((atMs - segment.performanceMs) / 1000) * segment.speed;
}
export function rhythmPerformanceAt(
  segments: readonly ClockSegment[],
  songTime: number
): number | null {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment?.speed !== 1 || !segment.acceptsInput) continue;
    const performance = segment.performanceMs + (songTime - segment.songSeconds) * 1000;
    if (
      performance >= segment.performanceMs &&
      performance <= (segments[index + 1]?.performanceMs ?? Infinity)
    )
      return performance;
  }
  return null;
}
export function validRhythmClock(
  receipt: IndependentRhythmClockReceipt,
  duration: number,
  startedAtMs: number,
  previous: readonly ClockSegment[] = []
): boolean {
  if (
    !array(receipt.segments) ||
    !receipt.segments.length ||
    receipt.segments.length > 64 ||
    !Number.isFinite(receipt.atMs) ||
    receipt.atMs < startedAtMs ||
    receipt.segments.length < previous.length ||
    previous.some(
      (segment, index) => JSON.stringify(segment) !== JSON.stringify(receipt.segments[index])
    )
  )
    return false;
  let running = false;
  for (let index = 0; index < receipt.segments.length; index++) {
    const segment = receipt.segments[index];
    if (
      !segment ||
      Object.keys(segment).some(
        (key) => !["performanceMs", "songSeconds", "speed", "acceptsInput"].includes(key)
      ) ||
      !Number.isFinite(segment.performanceMs) ||
      segment.performanceMs < 0 ||
      segment.performanceMs > receipt.atMs ||
      !Number.isFinite(segment.songSeconds) ||
      ![0, 1].includes(segment.speed) ||
      typeof segment.acceptsInput !== "boolean"
    )
      return false;
    if (index === 0 && segment.songSeconds !== -4) return false;
    const prior = receipt.segments[index - 1];
    if (
      prior &&
      (segment.performanceMs < prior.performanceMs ||
        Math.abs(
          segment.songSeconds -
            (prior.songSeconds +
              ((segment.performanceMs - prior.performanceMs) / 1000) * prior.speed)
        ) > EPSILON)
    )
      return false;
    // Trainer.load starts and pauses at the same instant. That superseded anchor
    // has no active interval and must not start the phase before manual play.
    if (receipt.segments[index + 1]?.performanceMs === segment.performanceMs) continue;
    if (segment.speed === 1) {
      if (
        !segment.acceptsInput ||
        (!running && (segment.performanceMs !== startedAtMs || segment.songSeconds !== -4))
      )
        return false;
      running = true;
    } else if (running && (segment.songSeconds < duration - EPSILON || segment.acceptsInput))
      return false;
    else if (!running && (segment.songSeconds !== -4 || segment.performanceMs > startedAtMs))
      return false;
  }
  const projected = rhythmClockAt(receipt.segments, receipt.atMs, false);
  const start = rhythmPerformanceAt(receipt.segments, 0);
  const endProjection = rhythmPerformanceAt(receipt.segments, duration);
  const end =
    endProjection !== null && endProjection <= receipt.atMs + EPSILON ? endProjection : null;
  return (
    running &&
    projected !== undefined &&
    Math.abs(receipt.songTime - Math.min(duration, projected)) < EPSILON &&
    receipt.startPerformanceMs === start &&
    receipt.endPerformanceMs === end &&
    receipt.ended === (end !== null)
  );
}
