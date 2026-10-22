const array = (value: unknown): boolean => Array.isArray(value);
import type { ClockSegment } from "../practice/timing";
import type { HeldBassClockReceipt, HeldBassFragment, HeldBassOnset } from "./heldBassTypes";

const EPSILON = 1e-8;
export function heldBassClockAt(
  segments: readonly ClockSegment[],
  atMs: number,
  limit: number,
  forInput = true
): number | undefined {
  const segment = segments.findLast((item) => item.performanceMs <= atMs);
  if (!segment || (forInput && !segment.acceptsInput)) return undefined;
  return Math.min(
    limit,
    segment.songSeconds + ((atMs - segment.performanceMs) / 1000) * segment.speed
  );
}
export function heldBassEndPerformance(
  segments: readonly ClockSegment[],
  duration: number
): number | null {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment?.speed !== 1 || segment.songSeconds > duration) continue;
    const crossing = segment.performanceMs + (duration - segment.songSeconds) * 1000;
    const next = segments[index + 1];
    if (!next || next.performanceMs >= crossing - EPSILON) return crossing;
  }
  return null;
}
/** Validate actual anchors, rather than inferring song time from elapsed React frames. */
export function validHeldBassClock(
  fragment: HeldBassFragment,
  segments: readonly ClockSegment[],
  onsets: readonly HeldBassOnset[],
  atMs: number
): boolean {
  if (
    !array(segments) ||
    !segments.length ||
    segments.length > 64 ||
    !array(onsets) ||
    onsets.length > fragment.steps.length
  )
    return false;
  const first = segments[0];
  if (!first || first.songSeconds < -2 || first.songSeconds > 0) return false;
  let onsetIndex = 0;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (
      !segment ||
      !Number.isFinite(segment.performanceMs) ||
      segment.performanceMs < 0 ||
      segment.performanceMs > atMs ||
      !Number.isFinite(segment.songSeconds) ||
      segment.songSeconds < -2 ||
      segment.songSeconds > fragment.song.duration ||
      ![0, 1].includes(segment.speed) ||
      typeof segment.acceptsInput !== "boolean" ||
      (!segment.acceptsInput && (segment.speed !== 0 || segment.songSeconds > 0 || onsetIndex > 0))
    )
      return false;
    if (index === 0) continue;
    const previous = segments[index - 1];
    if (!previous || segment.performanceMs < previous.performanceMs) return false;
    const expected =
      previous.songSeconds +
      ((segment.performanceMs - previous.performanceMs) / 1000) * previous.speed;
    if (Math.abs(segment.songSeconds - expected) > EPSILON) return false;
    if (!segment.acceptsInput) continue;
    if (!previous.acceptsInput && segment.songSeconds <= 0 && onsetIndex === 0) continue;
    if (previous.speed === 0 && segment.speed === 1) {
      const onset = onsets[onsetIndex];
      if (
        onset?.step !== onsetIndex ||
        onset.atMs !== segment.performanceMs ||
        Math.abs(segment.songSeconds - onsetIndex * 0.5) > EPSILON
      )
        return false;
      onsetIndex++;
    } else if (previous.speed === 1 && segment.speed === 0) {
      const boundary =
        onsetIndex < fragment.steps.length ? onsetIndex * 0.5 : fragment.song.duration;
      if (Math.abs(segment.songSeconds - boundary) > EPSILON) return false;
    } else if (segment.speed !== previous.speed) return false;
  }
  return onsetIndex === onsets.length;
}
export function heldBassReadyAt(
  fragment: HeldBassFragment,
  clock: readonly ClockSegment[],
  onsets: readonly HeldBassOnset[],
  step: number,
  correctedAtMs: number
): boolean {
  const previous = step === 0 ? null : onsets[step - 1];
  if (step > 0 && (!previous || correctedAtMs < previous.atMs)) return false;
  const limit = Math.min(fragment.song.duration, step * 0.5);
  const songTime = heldBassClockAt(clock, correctedAtMs, limit);
  return songTime !== undefined && songTime >= step * 0.5 - EPSILON;
}
export function validHeldBassClockReceipt(
  fragment: HeldBassFragment,
  onsets: readonly HeldBassOnset[],
  receipt: HeldBassClockReceipt,
  previous: readonly ClockSegment[]
): boolean {
  if (
    !Number.isFinite(receipt.atMs) ||
    receipt.atMs < 0 ||
    !validHeldBassClock(fragment, receipt.segments, onsets, receipt.atMs) ||
    receipt.segments.length < previous.length ||
    previous.some(
      (segment, index) => JSON.stringify(segment) !== JSON.stringify(receipt.segments[index])
    ) ||
    !array(receipt.dueNoteIds)
  )
    return false;
  const step = onsets.length;
  const boundary = step < fragment.steps.length ? step * 0.5 : fragment.song.duration;
  const songTime = heldBassClockAt(receipt.segments, receipt.atMs, boundary, false);
  const ids = fragment.steps[step] ?? [];
  return (
    songTime !== undefined &&
    receipt.songTime === songTime &&
    receipt.ended === songTime >= fragment.song.duration &&
    receipt.waiting === (step < fragment.steps.length && songTime >= boundary) &&
    receipt.dueNoteIds.length === ids.length &&
    new Set(receipt.dueNoteIds).size === ids.length &&
    ids.every((id) => receipt.dueNoteIds.includes(id))
  );
}
