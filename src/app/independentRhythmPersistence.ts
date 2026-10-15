import type {
  IndependentRhythmPhaseResult,
  IndependentRhythmResult
} from "../independentRhythm/types";
import { validateIndependentRhythmResult } from "../independentRhythm/validation";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import type { ReadingInputSource } from "../reading/types";
import {
  accept,
  inputSource,
  mergeCourseHistory,
  normalizeCourseState,
  seed,
  sourceFilter
} from "./courseStore";

function copyPhase(phase: IndependentRhythmPhaseResult) {
  return {
    ...phase,
    config: { ...phase.config },
    clock: { ...phase.clock, segments: phase.clock.segments.map((segment) => ({ ...segment })) },
    events: phase.events.map((event) => ({ ...event })),
    help: phase.help.map((receipt) => ({ ...receipt, pitches: [...receipt.pitches] })),
    outcomes: phase.outcomes.map((outcome) => ({ ...outcome })),
    extras: phase.extras.map((extra) => ({ ...extra })),
    summary: {
      ...phase.summary,
      left: { ...phase.summary.left },
      right: { ...phase.summary.right }
    }
  };
}
function copyResult(result: IndependentRhythmResult) {
  return { ...result, pulse: copyPhase(result.pulse), series: copyPhase(result.series) };
}
export interface IndependentRhythmPersistentState {
  seed: number;
  generatorVersion: number;
  inputSource: ReadingInputSource;
  sourceFilter: ReadingSourceFilter;
  showKeyHints: boolean;
  history: ReturnType<typeof copyResult>[];
}
export const emptyIndependentRhythmState = (): IndependentRhythmPersistentState => ({
  seed: 1,
  generatorVersion: 1,
  inputSource: "keyboard",
  sourceFilter: "all",
  showKeyHints: false,
  history: []
});
/** Existing committed evidence wins over edited copies from a stale tab. */
export function mergeIndependentRhythmHistory(
  saved: readonly IndependentRhythmResult[],
  incoming: readonly IndependentRhythmResult[]
) {
  return mergeCourseHistory(saved, incoming, {
    validate: validateIndependentRhythmResult,
    distinctIds: true,
    copy: copyResult
  });
}

export function normalizeIndependentRhythmState(value: unknown): {
  independentRhythm: IndependentRhythmPersistentState;
  invalid: boolean;
} {
  const { state, invalid } = normalizeCourseState(value, {
    empty: emptyIndependentRhythmState,
    fields: {
      seed: accept(seed),
      inputSource: accept(inputSource),
      sourceFilter: accept(sourceFilter),
      showKeyHints: (value) => (typeof value === "boolean" ? value : undefined)
    },
    validate: validateIndependentRhythmResult,
    merge: mergeIndependentRhythmHistory
  });
  return { independentRhythm: state, invalid };
}
