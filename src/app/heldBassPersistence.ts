import type { HeldBassResult } from "../reading/heldBassTypes";
import { validateHeldBassResult } from "../reading/heldBassValidation";
import type { ReadingSourceFilter } from "../reading/progressTypes";

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
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const seed = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const filter = (value: unknown): value is ReadingSourceFilter =>
  value === "all" || value === "midi" || value === "keyboard" || value === "pointer";

/** A committed run wins over a stale or edited copy in another tab. */
export function mergeHeldBassHistory(
  saved: readonly HeldBassResult[],
  incoming: readonly HeldBassResult[]
) {
  const unique = new Map<string, HeldBassResult>();
  const ids = new Set<string>();
  for (const value of [...saved, ...incoming]) {
    const result = validateHeldBassResult(value);
    if (result && !unique.has(result.runId) && !ids.has(result.id)) {
      unique.set(result.runId, result);
      ids.add(result.id);
    }
  }
  return [...unique.values()]
    .sort((a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId))
    .slice(-20)
    .map((result) => ({
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
        hintHistory: fragment.hintHistory.map((hint) => ({ ...hint })),
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
    }));
}

export function normalizeHeldBassState(value: unknown): {
  heldBass: HeldBassPersistentState;
  invalid: boolean;
} {
  const heldBass = emptyHeldBassState();
  if (value === undefined) return { heldBass, invalid: false };
  const row = object(value);
  const history = Array.isArray(row.history) ? row.history : [];
  const validHistory = history.flatMap((value) => {
    const result = validateHeldBassResult(value);
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
  heldBass.seed = seed(row.seed) ? row.seed : 1;
  heldBass.sourceFilter = filter(row.sourceFilter) ? row.sourceFilter : "all";
  heldBass.history = mergeHeldBassHistory([], validHistory);
  return { heldBass, invalid };
}
