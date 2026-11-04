import { physicalInputKey } from "./alignment";
import type { CourseExpectedNote, CoursePause, RawCourseInput, SongCourseMode } from "./model";

export function holdToleranceMs(durationMs: number, mode: SongCourseMode): number {
  return mode === "tempo" ? Math.max(120, durationMs * 0.2) : Math.max(180, durationMs * 0.3);
}

export interface CourseHold {
  readonly heldMs: number;
  readonly released: boolean;
  readonly correct: boolean;
}

export function physicalPerformanceMs(input: {
  readonly performanceMs: number;
  readonly rawPerformanceMs?: number;
}): number {
  return input.rawPerformanceMs ?? input.performanceMs;
}

export function physicalCourseOrder(
  a: {
    readonly performanceMs: number;
    readonly rawPerformanceMs?: number;
    readonly stableOrdinal: number;
  },
  b: {
    readonly performanceMs: number;
    readonly rawPerformanceMs?: number;
    readonly stableOrdinal: number;
  }
): number {
  return physicalPerformanceMs(a) - physicalPerformanceMs(b) || a.stableOrdinal - b.stableOrdinal;
}

/** Only a named pause/control-rehold pair joins segments of the primary hold. */
export function gradeCourseHold(
  expected: CourseExpectedNote,
  down: RawCourseInput,
  inputs: readonly RawCourseInput[],
  pauses: readonly CoursePause[],
  speed: number,
  mode: SongCourseMode,
  closedAtMs: number
): CourseHold {
  const durationMs = (expected.duration * 1000) / speed;
  const key = physicalInputKey(down);
  const events = [...inputs, ...pauses].sort(physicalCourseOrder);
  let heldMs = 0;
  let segmentStart: number | null = physicalPerformanceMs(down);
  let paused = false;
  let releaseAfterPause = false;
  for (const event of events) {
    if (physicalCourseOrder(event, down) <= 0 || physicalPerformanceMs(event) > closedAtMs)
      continue;
    if (event.type === "pause") {
      if (event.sourceNoteId !== expected.sourceNoteId || segmentStart === null) continue;
      heldMs += Math.max(0, event.performanceMs - segmentStart);
      segmentStart = null;
      paused = true;
      releaseAfterPause = event.requiresRehold === false;
      continue;
    }
    if (event.synthetic || physicalInputKey(event) !== key) continue;
    if (paused) {
      if (releaseAfterPause && event.type === "up")
        return {
          heldMs,
          released: true,
          correct: Math.abs(heldMs - durationMs) <= holdToleranceMs(durationMs, mode) + 1e-7
        };
      if (
        !releaseAfterPause &&
        event.type === "down" &&
        event.controlRehold === expected.sourceNoteId &&
        event.admitted !== false
      ) {
        segmentStart = physicalPerformanceMs(event);
        paused = false;
      }
      continue;
    }
    if (event.type === "up" && segmentStart !== null) {
      heldMs += Math.max(0, physicalPerformanceMs(event) - segmentStart);
      return {
        heldMs,
        released: true,
        correct: Math.abs(heldMs - durationMs) <= holdToleranceMs(durationMs, mode) + 1e-7
      };
    }
  }
  if (segmentStart !== null) heldMs += Math.max(0, closedAtMs - segmentStart);
  return { heldMs, released: false, correct: false };
}
