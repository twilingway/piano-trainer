import { bassReadingSequenceForSeed } from "../reading/bassGenerator";
import type { BassReadingResult, BassReadingTask } from "../reading/bassTypes";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import { accept, mergeCourseHistory, normalizeCourseState } from "./courseStore";

export interface BassPersistentState {
  task: BassReadingTask;
  seed: number;
  generatorVersion: number;
  sourceFilter: ReadingSourceFilter;
  history: BassReadingResult[];
}
export const emptyBassState = (): BassPersistentState => ({
  task: "notes",
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
const seed = (value: unknown): value is number => integer(value) && value <= 0xffffffff;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const task = (value: unknown): value is BassReadingTask => value === "notes" || value === "phrases";
const source = (value: unknown) => value === "midi" || value === "keyboard" || value === "pointer";
const filter = (value: unknown): value is ReadingSourceFilter => value === "all" || source(value);
const level = (value: unknown) => value === 0 || value === 1 || value === 2;

/** Only complete, generator-backed bass evidence may enter this independent history. */
export function validBassResult(value: unknown): value is BassReadingResult {
  const row = object(value);
  if (
    !text(row.id) ||
    !text(row.runId) ||
    row.skillId !== "bass-note-reading" ||
    !task(row.task) ||
    !seed(row.seed) ||
    row.generatorVersion !== 1 ||
    !finite(row.createdAt) ||
    !finite(row.completedAt) ||
    row.completedAt !== row.createdAt ||
    !(row.startedAt === null || (finite(row.startedAt) && row.startedAt <= row.completedAt)) ||
    row.provenance !== "native" ||
    row.newMaterial !== false ||
    row.plan !== null ||
    !Array.isArray(row.notes) ||
    row.notes.length !== 20
  )
    return false;
  const sequence = bassReadingSequenceForSeed(row.seed);
  if (row.exerciseId !== `bass-reading-v1-${row.task}-${String(row.seed)}`) return false;
  const attemptIds = new Set<string>();
  let previousEnd = -1;
  return row.notes.every((value, index) => {
    const note = object(value);
    const expected = sequence[index];
    if (
      expected === undefined ||
      note.noteId !== `p0n${String(index)}` ||
      note.expectedMidi !== expected ||
      !finite(note.presentedAtMs) ||
      note.presentedAtMs < previousEnd ||
      !finite(note.responseLatencyMs) ||
      !level(note.hintLevel) ||
      !Array.isArray(note.hintHistory) ||
      !Array.isArray(note.attempts) ||
      !note.attempts.length
    )
      return false;
    let previousHintAt = note.presentedAtMs;
    let previousLevel = 0;
    for (const value of note.hintHistory) {
      const hint = object(value);
      if (
        !finite(hint.atMs) ||
        hint.atMs < previousHintAt ||
        !level(hint.level) ||
        (hint.level as number) <= previousLevel
      )
        return false;
      previousHintAt = hint.atMs;
      previousLevel = hint.level;
    }
    let previousAt = note.presentedAtMs;
    let previousLatency = 0;
    for (const [attemptIndex, value] of note.attempts.entries()) {
      const attempt = object(value);
      const final = attemptIndex === note.attempts.length - 1;
      if (
        attempt.skillId !== row.skillId ||
        attempt.runId !== row.runId ||
        attempt.exerciseId !== row.exerciseId ||
        attempt.noteId !== note.noteId ||
        attempt.expectedMidi !== note.expectedMidi ||
        !text(attempt.attemptId) ||
        attemptIds.has(attempt.attemptId) ||
        !integer(attempt.playedMidi) ||
        attempt.playedMidi > 127 ||
        !source(attempt.inputSource) ||
        !finite(attempt.atMs) ||
        attempt.atMs < previousAt ||
        !finite(attempt.responseLatencyMs) ||
        attempt.responseLatencyMs < previousLatency ||
        attempt.responseLatencyMs > attempt.atMs - note.presentedAtMs ||
        !level(attempt.hintLevel) ||
        final !== (attempt.playedMidi === note.expectedMidi)
      )
        return false;
      const shown: unknown = note.hintHistory
        .filter((value) => (object(value).atMs as number) <= (attempt.atMs as number))
        .at(-1);
      if (attempt.hintLevel !== (shown === undefined ? 0 : object(shown).level)) return false;
      attemptIds.add(attempt.attemptId);
      previousAt = attempt.atMs;
      previousLatency = attempt.responseLatencyMs;
    }
    previousEnd = previousAt;
    const final = object(note.attempts.at(-1));
    return (
      previousHintAt <= previousEnd &&
      note.firstAttemptCorrect === (note.attempts.length === 1) &&
      note.independentCorrect === (note.attempts.length === 1 && final.hintLevel === 0) &&
      note.unassistedSolved === (final.hintLevel === 0) &&
      note.hintLevel === final.hintLevel &&
      note.responseLatencyMs === final.responseLatencyMs
    );
  });
}
function cloneBassResult(result: BassReadingResult) {
  return {
    ...result,
    notes: result.notes.map((note) => ({
      ...note,
      attempts: note.attempts.map((attempt) => ({ ...attempt })),
      hintHistory: note.hintHistory?.map((hint) => ({ ...hint })) ?? []
    }))
  };
}
export function mergeBassHistory(
  saved: readonly BassReadingResult[],
  incoming: readonly BassReadingResult[]
) {
  return mergeCourseHistory(saved, incoming, {
    validate: (result) => (validBassResult(result) ? result : null),
    groups: { of: (result) => result.task, order: ["notes", "phrases"] },
    copy: cloneBassResult
  });
}
export function normalizeBassState(value: unknown): {
  bass: BassPersistentState;
  invalid: boolean;
} {
  const { state, invalid } = normalizeCourseState(value, {
    empty: emptyBassState,
    fields: {
      task: (value, row) =>
        task(value) ? (row.generatorVersion === 1 ? value : "notes") : undefined,
      seed: accept(seed),
      sourceFilter: accept(filter)
    },
    validate: (result) => (validBassResult(result) ? result : null),
    merge: mergeBassHistory
  });
  return { bass: state, invalid };
}
