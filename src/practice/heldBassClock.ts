import type { ClockSegment } from "./timing";
import type { SongNote } from "../song/song";

export interface HeldBassClockReceipt {
  readonly segments: readonly ClockSegment[];
  readonly songTime: number;
  readonly waiting: boolean;
  readonly ended: boolean;
  readonly dueNoteIds: readonly string[];
  readonly atMs: number;
}

export function heldBassClockReceipt(
  anchors: readonly ClockSegment[],
  due: readonly SongNote[],
  duration: number,
  fallbackTime: number,
  atMs: number
): HeldBassClockReceipt {
  const boundary = due[0]?.start ?? duration;
  const segments = clippedClockSegments(anchors, atMs, boundary);
  const last = segments.at(-1);
  const songTime = last
    ? last.songSeconds + ((atMs - last.performanceMs) / 1000) * last.speed
    : fallbackTime;
  return {
    // A 65th segment is an explicit overflow witness, never a silently truncated valid proof.
    segments: segments.slice(0, 65),
    songTime,
    waiting: due.length > 0 && songTime >= boundary,
    ended: songTime >= duration,
    dueNoteIds: due.map((note) => note.id),
    atMs
  };
}

/** Clip projection at a real pending onset/end, including between animation frames. */
export function clippedClockSegments(
  segments: readonly ClockSegment[],
  atMs: number,
  boundary: number
): ClockSegment[] {
  const copy = segments
    .filter((segment) => segment.performanceMs <= atMs)
    .map((segment) => ({ ...segment }));
  const last = copy.at(-1);
  if (last && last.speed > 0) {
    const crossing = last.performanceMs + ((boundary - last.songSeconds) / last.speed) * 1000;
    if (crossing >= last.performanceMs && crossing <= atMs)
      copy.push({
        performanceMs: crossing,
        songSeconds: boundary,
        speed: 0,
        acceptsInput: last.acceptsInput
      });
  }
  return copy;
}
