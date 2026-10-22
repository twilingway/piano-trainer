import { readingMedian } from "./progress";
import type { ReadingSourceFilter } from "./progressTypes";
import type { TwoHandResult } from "./twoHandTypes";
export interface TwoHandSummary {
  readonly pairCount: number;
  readonly errorCount: number;
  readonly helpedCount: number;
  readonly independentCount: number;
  readonly unassistedCount: number;
  readonly spreadMs: number | null;
  readonly firstLatencyMs: number | null;
  readonly responseLatencyMs: number | null;
  readonly independentLatencyMs: number | null;
}
export function summarizeTwoHandResults(
  results: readonly TwoHandResult[],
  source: ReadingSourceFilter = "all"
): TwoHandSummary {
  const seen = new Set<string>();
  const pairs = results
    .toSorted((a, b) => b.completedAt - a.completedAt)
    .filter((result) => {
      if (seen.has(result.runId)) return false;
      seen.add(result.runId);
      return true;
    })
    .slice(0, 20)
    .flatMap((result) => result.pairs)
    .filter((pair) => source === "all" || pair.attempts.at(-1)?.inputSource === source);
  const independent = pairs.filter((pair) => pair.independentCorrect);
  return {
    pairCount: pairs.length,
    errorCount: pairs.reduce(
      (sum, pair) => sum + pair.attempts.filter((attempt) => attempt.outcome !== "success").length,
      0
    ),
    helpedCount: pairs.filter((pair) => pair.hintLevel > 0).length,
    independentCount: independent.length,
    unassistedCount: pairs.filter((pair) => pair.unassistedSolved).length,
    spreadMs: readingMedian(pairs.map((pair) => pair.spreadMs)),
    firstLatencyMs: readingMedian(pairs.map((pair) => pair.firstLatencyMs)),
    responseLatencyMs: readingMedian(pairs.map((pair) => pair.responseLatencyMs)),
    independentLatencyMs: readingMedian(independent.map((pair) => pair.firstLatencyMs))
  };
}
