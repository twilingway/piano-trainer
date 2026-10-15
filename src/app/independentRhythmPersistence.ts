import type {
  IndependentRhythmPhaseResult,
  IndependentRhythmResult
} from "../independentRhythm/types";
import { validateIndependentRhythmResult } from "../independentRhythm/validation";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import type { ReadingInputSource } from "../reading/types";

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
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const seed = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const source = (value: unknown): value is ReadingInputSource =>
  value === "midi" || value === "keyboard" || value === "pointer";
const filter = (value: unknown): value is ReadingSourceFilter => value === "all" || source(value);

/** Existing committed evidence wins over edited copies from a stale tab. */
export function mergeIndependentRhythmHistory(
  saved: readonly IndependentRhythmResult[],
  incoming: readonly IndependentRhythmResult[]
) {
  const unique = new Map<string, IndependentRhythmResult>();
  const ids = new Set<string>();
  for (const value of [...saved, ...incoming]) {
    const result = validateIndependentRhythmResult(value);
    if (result && !unique.has(result.runId) && !ids.has(result.id)) {
      unique.set(result.runId, result);
      ids.add(result.id);
    }
  }
  return [...unique.values()]
    .sort((a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId))
    .slice(-20)
    .map(copyResult);
}

export function normalizeIndependentRhythmState(value: unknown): {
  independentRhythm: IndependentRhythmPersistentState;
  invalid: boolean;
} {
  const independentRhythm = emptyIndependentRhythmState();
  if (value === undefined) return { independentRhythm, invalid: false };
  const row = object(value);
  const history = Array.isArray(row.history) ? row.history : [];
  const validHistory = history.flatMap((value) => {
    const result = validateIndependentRhythmResult(value);
    return result ? [result] : [];
  });
  const invalid =
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !seed(row.seed) ||
    row.generatorVersion !== 1 ||
    !source(row.inputSource) ||
    !filter(row.sourceFilter) ||
    typeof row.showKeyHints !== "boolean" ||
    !Array.isArray(row.history) ||
    validHistory.length !== history.length;
  independentRhythm.seed = seed(row.seed) ? row.seed : 1;
  independentRhythm.inputSource = source(row.inputSource) ? row.inputSource : "keyboard";
  independentRhythm.sourceFilter = filter(row.sourceFilter) ? row.sourceFilter : "all";
  independentRhythm.showKeyHints = typeof row.showKeyHints === "boolean" ? row.showKeyHints : false;
  independentRhythm.history = mergeIndependentRhythmHistory([], validHistory);
  return { independentRhythm, invalid };
}
