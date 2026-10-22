import type { HeldBassResult } from "../reading/heldBassTypes";
import { validateHeldBassResult } from "../reading/heldBassValidation";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import {
  accept,
  mergeCourseHistory,
  normalizeCourseState,
  seed,
  sourceFilter
} from "./courseStore";

export interface HeldBassPersistentState {
  seed: number;
  generatorVersion: number;
  sourceFilter: ReadingSourceFilter;
  history: HeldBassResult[];
}
export const emptyHeldBassState = (): HeldBassPersistentState => ({
  seed: 1,
  generatorVersion: 1,
  sourceFilter: "all",
  history: []
});
function copyHeldBassResult(result: HeldBassResult) {
  return {
    id: result.id,
    runId: result.runId,
    skillId: result.skillId,
    task: result.task,
    exerciseId: result.exerciseId,
    seed: result.seed,
    generatorVersion: result.generatorVersion,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    createdAt: result.createdAt,
    fragments: result.fragments.map((fragment) => ({
      fragmentId: fragment.fragmentId,
      bassPitch: fragment.bassPitch,
      firstAttemptCorrect: fragment.firstAttemptCorrect,
      independentCorrect: fragment.independentCorrect,
      unassistedSolved: fragment.unassistedSolved,
      hintLevel: fragment.hintLevel,
      firstLatencyMs: fragment.firstLatencyMs,
      responseLatencyMs: fragment.responseLatencyMs,
      spreadMs: fragment.spreadMs,
      heldDurationMs: fragment.heldDurationMs,
      melodyPitches: [...fragment.melodyPitches],
      hintHistory: fragment.hintHistory.map((hint) => ({
        ...hint,
        clock: hint.clock.map((segment) => ({ ...segment })),
        onsets: hint.onsets.map((onset) => ({ ...onset, noteIds: [...onset.noteIds] }))
      })),
      attempts: fragment.attempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        presentationId: attempt.presentationId,
        presentedAtMs: attempt.presentedAtMs,
        boundaryAtMs: attempt.boundaryAtMs,
        outcome: attempt.outcome,
        inputSource: attempt.inputSource,
        offsetMs: attempt.offsetMs,
        firstDownAtMs: attempt.firstDownAtMs,
        secondDownAtMs: attempt.secondDownAtMs,
        spreadMs: attempt.spreadMs,
        rawEndAtMs: attempt.rawEndAtMs,
        releasedAtMs: attempt.releasedAtMs,
        finalizedAtMs: attempt.finalizedAtMs,
        activeIntervals: attempt.activeIntervals.map((interval) => ({ ...interval })),
        events: attempt.events.map((event) => ({ ...event })),
        clock: attempt.clock.map((segment) => ({ ...segment })),
        onsets: attempt.onsets.map((onset) => ({ ...onset, noteIds: [...onset.noteIds] }))
      }))
    }))
  };
}

/** A committed run wins over a stale or edited copy in another tab. */
export function mergeHeldBassHistory(
  saved: readonly HeldBassResult[],
  incoming: readonly HeldBassResult[]
) {
  return mergeCourseHistory(saved, incoming, {
    validate: validateHeldBassResult,
    distinctIds: true,
    copy: copyHeldBassResult
  });
}

export function normalizeHeldBassState(value: unknown): {
  heldBass: HeldBassPersistentState;
  invalid: boolean;
} {
  const { state, invalid } = normalizeCourseState(value, {
    empty: emptyHeldBassState,
    fields: { seed: accept(seed), sourceFilter: accept(sourceFilter) },
    validate: validateHeldBassResult,
    merge: mergeHeldBassHistory
  });
  return { heldBass: state, invalid };
}
