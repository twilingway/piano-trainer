import { INTERVAL_CATEGORIES } from "./types";
import type {
  IntervalCategory,
  IntervalMode,
  IntervalQuestionResult,
  IntervalResult,
  IntervalSourceFilter
} from "./types";

export interface IntervalMetrics {
  readonly questionCount: number;
  readonly firstAttemptCorrectCount: number;
  readonly independentCorrectCount: number;
  readonly unassistedSolvedCount: number;
  readonly errorCount: number;
  readonly helpedCount: number;
  readonly firstListeningCorrectCount: number | null;
  readonly fullListeningCount: number;
  readonly partialListeningCount: number;
  readonly medianFirstReactionMs: number | null;
  readonly medianSolutionMs: number | null;
  readonly medianIndependentReactionMs: number | null;
}

export interface IntervalSummary extends IntervalMetrics {
  readonly mode: IntervalMode;
  readonly source: IntervalSourceFilter;
  readonly categories: readonly (IntervalMetrics & { readonly category: IntervalCategory })[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function metrics(
  questions: readonly IntervalQuestionResult[],
  mode: IntervalMode
): IntervalMetrics {
  return {
    questionCount: questions.length,
    firstAttemptCorrectCount: questions.filter((q) => q.firstAttemptCorrect).length,
    independentCorrectCount: questions.filter((q) => q.independentCorrect).length,
    unassistedSolvedCount: questions.filter((q) => q.unassistedSolved).length,
    errorCount: questions.reduce((sum, q) => sum + q.attempts.filter((a) => !a.correct).length, 0),
    helpedCount: questions.filter((q) => q.helpHistory.length > 0).length,
    firstListeningCorrectCount:
      mode === "hear-and-choose" ? questions.filter((q) => q.firstListeningCorrect).length : null,
    fullListeningCount: questions.reduce((sum, q) => sum + q.fullListeningCount, 0),
    partialListeningCount: questions.reduce((sum, q) => sum + q.partialListeningCount, 0),
    medianFirstReactionMs: median(questions.map((q) => q.firstReactionMs)),
    medianSolutionMs: median(questions.map((q) => q.solutionMs)),
    medianIndependentReactionMs: median(
      questions.filter((q) => q.independentCorrect).map((q) => q.firstReactionMs)
    )
  };
}

/** Source filtering selects whole questions, never re-evaluating earlier attacks or help. */
export function summarizeIntervals(
  results: readonly IntervalResult[],
  mode: IntervalMode,
  source: IntervalSourceFilter = "all"
): IntervalSummary {
  const unique = new Map<string, IntervalResult>();
  for (const result of results) {
    if (result.mode === mode && !unique.has(result.runId)) unique.set(result.runId, result);
  }
  const questions = [...unique.values()]
    .flatMap((result) => result.questions)
    .filter((q) => source === "all" || q.inputSource === source);
  return {
    mode,
    source,
    ...metrics(questions, mode),
    categories: INTERVAL_CATEGORIES.map((category) => ({
      category,
      ...metrics(
        questions.filter((q) => q.category === category),
        mode
      )
    }))
  };
}
