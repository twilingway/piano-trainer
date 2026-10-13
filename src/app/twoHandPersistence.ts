import type { TwoHandResult } from "../reading/twoHandTypes";
import { validateTwoHandResult } from "../reading/twoHandValidation";
import type { ReadingSourceFilter } from "../reading/progressTypes";

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
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const seed = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const filter = (value: unknown): value is ReadingSourceFilter =>
  value === "all" || value === "midi" || value === "keyboard" || value === "pointer";

/** A committed run wins over a stale or edited copy in another tab. */
export function mergeTwoHandHistory(
  saved: readonly TwoHandResult[],
  incoming: readonly TwoHandResult[]
) {
  const unique = new Map<string, TwoHandResult>();
  const ids = new Set<string>();
  for (const value of [...saved, ...incoming]) {
    const result = validateTwoHandResult(value);
    if (result && !unique.has(result.runId) && !ids.has(result.id)) {
      unique.set(result.runId, result);
      ids.add(result.id);
    }
  }
  return [...unique.values()]
    .sort((a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId))
    .slice(-20)
    .map((result) => ({
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
    }));
}

export function normalizeTwoHandState(value: unknown): {
  coordination: TwoHandPersistentState;
  invalid: boolean;
} {
  const coordination = emptyTwoHandState();
  if (value === undefined) return { coordination, invalid: false };
  const row = object(value);
  const history = Array.isArray(row.history) ? row.history : [];
  const validHistory = history.flatMap((value) => {
    const result = validateTwoHandResult(value);
    return result ? [result] : [];
  });
  const invalid =
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !seed(row.seed) ||
    row.generatorVersion !== 1 ||
    !filter(row.sourceFilter) ||
    !Array.isArray(row.history) ||
    validHistory.length !== history.length;
  coordination.seed = seed(row.seed) ? row.seed : 1;
  coordination.sourceFilter = filter(row.sourceFilter) ? row.sourceFilter : "all";
  coordination.history = mergeTwoHandHistory([], validHistory);
  return { coordination, invalid };
}
