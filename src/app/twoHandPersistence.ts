import type { TwoHandResult } from "../reading/twoHandTypes";
import { validateTwoHandResult } from "../reading/twoHandValidation";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import {
  accept,
  mergeCourseHistory,
  normalizeCourseState,
  seed,
  sourceFilter
} from "./courseStore";

export interface TwoHandPersistentState {
  seed: number;
  generatorVersion: number;
  sourceFilter: ReadingSourceFilter;
  history: TwoHandResult[];
}
export const emptyTwoHandState = (): TwoHandPersistentState => ({
  seed: 1,
  generatorVersion: 1,
  sourceFilter: "all",
  history: []
});
function copyTwoHandResult(result: TwoHandResult) {
  return {
    ...result,
    pairs: result.pairs.map((pair) => ({
      ...pair,
      noteIds: [...pair.noteIds] as [string, string],
      expectedMidi: [...pair.expectedMidi] as [number, number],
      activeIntervals: pair.activeIntervals.map((interval) => ({ ...interval })),
      hintHistory: pair.hintHistory.map((hint) => ({ ...hint })),
      attempts: pair.attempts.map((attempt) => ({
        ...attempt,
        events: attempt.events.map((event) => ({ ...event }))
      }))
    }))
  };
}

/** A committed run wins over a stale or edited copy in another tab. */
export function mergeTwoHandHistory(
  saved: readonly TwoHandResult[],
  incoming: readonly TwoHandResult[]
) {
  return mergeCourseHistory(saved, incoming, {
    validate: validateTwoHandResult,
    distinctIds: true,
    copy: copyTwoHandResult
  });
}

export function normalizeTwoHandState(value: unknown): {
  coordination: TwoHandPersistentState;
  invalid: boolean;
} {
  const { state, invalid } = normalizeCourseState(value, {
    empty: emptyTwoHandState,
    fields: { seed: accept(seed), sourceFilter: accept(sourceFilter) },
    validate: validateTwoHandResult,
    merge: mergeTwoHandHistory
  });
  return { coordination: state, invalid };
}
