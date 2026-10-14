import type { ReadingState } from "./readingSlice";
import type { ReadingTask } from "../reading/types";
import { normalizeIntervalState } from "./intervalPersistence";
import { normalizeRhythmState } from "./rhythmPersistence";
import { normalizeBassState } from "./bassPersistence";
import { normalizeTwoHandState } from "./twoHandPersistence";
import { normalizeHeldBassState } from "./heldBassPersistence";

/** Schema-specific siblings are normalized together; P2 stays outside this boundary. */
export function normalizeReadingCourses(
  row: Record<string, unknown>,
  selectedTask: ReadingTask | null
) {
  const modern = [3, 4, 5, 6, 7].includes(row.schemaVersion as number);
  const hasRhythm = [4, 5, 6, 7].includes(row.schemaVersion as number);
  const hasBass = [5, 6, 7].includes(row.schemaVersion as number);
  const intervalState = normalizeIntervalState(modern ? row.intervals : undefined);
  const rhythmState = normalizeRhythmState(hasRhythm ? row.rhythm : undefined);
  const bassState = normalizeBassState(hasBass ? row.bass : undefined);
  const coordinationState = normalizeTwoHandState(
    [6, 7].includes(row.schemaVersion as number) ? row.coordination : undefined
  );
  const heldBassState = normalizeHeldBassState(row.schemaVersion === 7 ? row.heldBass : undefined);
  const activeCourse: ReadingState["activeCourse"] = modern
    ? row.activeCourse === "note-reading" && selectedTask
      ? "note-reading"
      : row.activeCourse === "interval-training" && intervalState.intervals.mode
        ? "interval-training"
        : hasRhythm && row.activeCourse === "rhythm-training"
          ? "rhythm-training"
          : hasBass && row.activeCourse === "bass-reading"
            ? "bass-reading"
            : [6, 7].includes(row.schemaVersion as number) &&
                row.activeCourse === "two-hand-coordination"
              ? "two-hand-coordination"
              : row.schemaVersion === 7 && row.activeCourse === "held-bass-reading"
                ? "held-bass-reading"
                : null
    : selectedTask
      ? "note-reading"
      : null;
  const invalid =
    intervalState.invalid ||
    rhythmState.invalid ||
    bassState.invalid ||
    coordinationState.invalid ||
    heldBassState.invalid ||
    (row.schemaVersion === 7 && row.heldBass === undefined) ||
    ([6, 7].includes(row.schemaVersion as number) && row.coordination === undefined) ||
    (hasBass && row.bass === undefined) ||
    (hasRhythm && row.rhythm === undefined) ||
    (modern && row.intervals === undefined) ||
    (modern && row.activeCourse === "note-reading" && selectedTask === null) ||
    (modern && row.activeCourse === "interval-training" && intervalState.intervals.mode === null) ||
    (modern &&
      ![
        null,
        "note-reading",
        "interval-training",
        ...(hasRhythm ? ["rhythm-training"] : []),
        ...(hasBass ? ["bass-reading"] : []),
        ...([6, 7].includes(row.schemaVersion as number) ? ["two-hand-coordination"] : []),
        ...(row.schemaVersion === 7 ? ["held-bass-reading"] : [])
      ].includes(row.activeCourse as null | string));
  return {
    intervals: intervalState.intervals,
    rhythm: rhythmState.rhythm,
    bass: bassState.bass,
    coordination: coordinationState.coordination,
    heldBass: heldBassState.heldBass,
    activeCourse,
    invalid
  };
}
