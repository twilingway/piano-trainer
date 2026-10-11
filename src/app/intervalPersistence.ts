import type { IntervalMode, IntervalResult, IntervalSourceFilter } from "../intervals/types";

export interface IntervalPersistentState {
  mode: IntervalMode | null;
  seed: number;
  generatorVersion: number;
  sourceFilter: IntervalSourceFilter;
  history: IntervalResult[];
}
export const emptyIntervalState = (): IntervalPersistentState => ({
  mode: null,
  seed: 1,
  generatorVersion: 1,
  sourceFilter: "all",
  history: []
});
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isInteger(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const source = (value: unknown) => ["midi", "keyboard", "pointer"].includes(String(value));
const filter = (value: unknown): value is IntervalSourceFilter => value === "all" || source(value);
const mode = (value: unknown): value is IntervalMode =>
  value === "see-and-play" || value === "hear-and-choose";
const categories = ["repeat", "step-up", "step-down", "third-up", "third-down"];
const category = (value: unknown) => categories.includes(String(value));
const pitches = [60, 62, 64, 65, 67];
const pitch = (value: unknown) => integer(value) && value <= 127;
const whitePitch = (value: unknown) => finite(value) && pitches.includes(value);
const booleans = (values: readonly unknown[]) =>
  values.every((value) => typeof value === "boolean");

/** Validate concrete P3 payloads without turning category choices into P2 note events. */
export function validIntervalResult(value: unknown): value is IntervalResult {
  const row = object(value);
  if (
    !text(row.id) ||
    !text(row.runId) ||
    !text(row.exerciseId) ||
    !mode(row.mode) ||
    !integer(row.seed) ||
    row.generatorVersion !== 1 ||
    !finite(row.createdAt) ||
    !finite(row.completedAt) ||
    !(row.startedAt === null || (finite(row.startedAt) && row.startedAt <= row.completedAt)) ||
    !Array.isArray(row.questions) ||
    row.questions.length !== 10
  )
    return false;
  const visual = row.mode === "see-and-play";
  if (row.skillId !== (visual ? "interval-pair-playing" : "aural-interval")) return false;
  const kind = visual ? "piano-pair" : "category-choice";
  const questionIds = new Set<string>();
  const attemptIds = new Set<string>();
  const counts = new Map<string, number>();
  return (
    row.questions.every((value) => {
      const question = object(value);
      if (
        !text(question.questionId) ||
        questionIds.has(question.questionId) ||
        !category(question.category) ||
        !whitePitch(question.anchorMidi) ||
        !whitePitch(question.targetMidi) ||
        !source(question.inputSource) ||
        (!visual && question.inputSource === "midi") ||
        question.responseKind !== kind ||
        !booleans([
          question.firstAttemptCorrect,
          question.independentCorrect,
          question.unassistedSolved
        ]) ||
        !(visual
          ? question.firstListeningCorrect === null
          : typeof question.firstListeningCorrect === "boolean") ||
        !finite(question.firstReactionMs) ||
        !finite(question.solutionMs) ||
        question.solutionMs < question.firstReactionMs ||
        !integer(question.fullListeningCount) ||
        !integer(question.partialListeningCount) ||
        !(question.presentedAtMs === null || finite(question.presentedAtMs)) ||
        !Array.isArray(question.helpHistory) ||
        !question.helpHistory.every((help) => finite(object(help).atMs)) ||
        !Array.isArray(question.attempts) ||
        question.attempts.length < (visual ? 2 : 1)
      )
        return false;
      questionIds.add(question.questionId);
      const difference =
        pitches.indexOf(question.targetMidi as number) -
        pitches.indexOf(question.anchorMidi as number);
      const expected = (
        {
          "0": "repeat",
          "1": "step-up",
          "-1": "step-down",
          "2": "third-up",
          "-2": "third-down"
        } as Record<string, string>
      )[String(difference)];
      if (expected !== question.category) return false;
      counts.set(String(question.category), (counts.get(String(question.category)) ?? 0) + 1);
      let previousAt = -1;
      if (
        !question.attempts.every((value) => {
          const attempt = object(value);
          if (
            attempt.skillId !== row.skillId ||
            attempt.runId !== row.runId ||
            attempt.exerciseId !== row.exerciseId ||
            attempt.questionId !== question.questionId ||
            !text(attempt.attemptId) ||
            attemptIds.has(attempt.attemptId) ||
            !source(attempt.inputSource) ||
            (!visual && attempt.inputSource === "midi") ||
            !finite(attempt.atMs) ||
            attempt.atMs < previousAt ||
            !finite(attempt.responseLatencyMs) ||
            !booleans([attempt.helpShown, attempt.correct]) ||
            attempt.responseKind !== kind
          )
            return false;
          previousAt = attempt.atMs;
          attemptIds.add(attempt.attemptId);
          if (visual)
            return (
              (attempt.noteRole === 0 || attempt.noteRole === 1) &&
              attempt.expectedMidi ===
                (attempt.noteRole === 0 ? question.anchorMidi : question.targetMidi) &&
              pitch(attempt.playedMidi) &&
              attempt.correct === (attempt.playedMidi === attempt.expectedMidi)
            );
          return (
            attempt.expectedCategory === question.category &&
            category(attempt.chosenCategory) &&
            attempt.correct === (attempt.chosenCategory === attempt.expectedCategory)
          );
        })
      )
        return false;
      const final = object(question.attempts.at(-1));
      return (
        final.correct === true &&
        final.inputSource === question.inputSource &&
        (!visual || final.noteRole === 1)
      );
    }) && categories.every((key) => counts.get(key) === 2)
  );
}

function cloneIntervalResult(result: IntervalResult) {
  return {
    ...result,
    questions: result.questions.map((question) => ({
      ...question,
      attempts: question.attempts.map((attempt) => ({ ...attempt })),
      helpHistory: question.helpHistory.map((help) => ({ ...help }))
    }))
  };
}

export function mergeIntervalHistory(
  saved: readonly IntervalResult[],
  incoming: readonly IntervalResult[]
): ReturnType<typeof cloneIntervalResult>[] {
  const unique = new Map<string, IntervalResult>();
  // A stale sibling snapshot must not replace an already committed run.
  for (const result of [...saved, ...incoming]) {
    if (!unique.has(result.runId)) unique.set(result.runId, result);
  }
  const sorted = [...unique.values()].sort(
    (a, b) => a.completedAt - b.completedAt || a.runId.localeCompare(b.runId)
  );
  return (["see-and-play", "hear-and-choose"] as const)
    .flatMap((mode) => sorted.filter((result) => result.mode === mode).slice(-20))
    .map(cloneIntervalResult);
}

export function normalizeIntervalState(value: unknown): {
  intervals: IntervalPersistentState;
  invalid: boolean;
} {
  const intervals = emptyIntervalState();
  if (value === undefined) return { intervals, invalid: false };
  const row = object(value);
  const history = Array.isArray(row.history) ? row.history : [];
  const invalid =
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !(row.mode === null || mode(row.mode)) ||
    !integer(row.seed) ||
    row.generatorVersion !== 1 ||
    !filter(row.sourceFilter) ||
    !Array.isArray(row.history) ||
    history.some((result) => !validIntervalResult(result));
  intervals.mode = mode(row.mode) && row.generatorVersion === 1 ? row.mode : null;
  intervals.seed = integer(row.seed) ? row.seed >>> 0 : 1;
  intervals.sourceFilter = filter(row.sourceFilter) ? row.sourceFilter : "all";
  intervals.history = mergeIntervalHistory([], history.filter(validIntervalResult));
  return { intervals, invalid };
}
