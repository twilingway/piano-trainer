import { readingMedian } from "./progress";
import type { ReadingSourceFilter } from "./progressTypes";
import type { HeldBassResult } from "./heldBassTypes";
export interface HeldBassSummary {
  readonly fragmentCount: number;
  readonly errorCount: number;
  readonly helpedCount: number;
  readonly independentCount: number;
  readonly unassistedCount: number;
  readonly spreadMs: number | null;
  readonly firstLatencyMs: number | null;
  readonly responseLatencyMs: number | null;
  readonly independentLatencyMs: number | null;
  readonly heldDurationMs: number | null;
}
export function summarizeHeldBassResults(
  results: readonly HeldBassResult[],
  source: ReadingSourceFilter = "all"
): HeldBassSummary {
  const seen = new Set<string>();
  const fragments = results
    .toSorted((a, b) => b.completedAt - a.completedAt)
    .filter((result) => {
      if (seen.has(result.runId)) return false;
      seen.add(result.runId);
      return true;
    })
    .slice(0, 20)
    .flatMap((result) => result.fragments)
    .filter((fragment) => source === "all" || fragment.attempts.at(-1)?.inputSource === source);
  const independent = fragments.filter((fragment) => fragment.independentCorrect);
  return {
    fragmentCount: fragments.length,
    errorCount: fragments.reduce(
      (sum, fragment) =>
        sum + fragment.attempts.filter((attempt) => attempt.outcome !== "success").length,
      0
    ),
    helpedCount: fragments.filter((fragment) => fragment.hintLevel > 0).length,
    independentCount: independent.length,
    unassistedCount: fragments.filter((fragment) => fragment.unassistedSolved).length,
    spreadMs: readingMedian(fragments.map((fragment) => fragment.spreadMs)),
    firstLatencyMs: readingMedian(fragments.map((fragment) => fragment.firstLatencyMs)),
    responseLatencyMs: readingMedian(fragments.map((fragment) => fragment.responseLatencyMs)),
    independentLatencyMs: readingMedian(independent.map((fragment) => fragment.firstLatencyMs)),
    heldDurationMs: readingMedian(fragments.map((fragment) => fragment.heldDurationMs))
  };
}
