import type { ReadingResult } from "../reading/types";
import { beginnerStage, validBeginnerSelection, type BeginnerSelection } from "./catalog";
import { generateBeginnerExercise } from "./generator";
export interface BeginnerResult {
  readonly selection: BeginnerSelection;
  readonly generatorVersion: 1;
  readonly result: ReadingResult;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const level = (value: unknown): value is number => value === 0 || value === 1 || value === 2;
/** Complete native runs alone may enter the beginner journal. Legacy evidence stays separate. */
export function validBeginnerResult(value: unknown): value is BeginnerResult {
  const v = object(value);
  if (
    v.generatorVersion !== 1 ||
    !validBeginnerSelection(v.selection) ||
    v.selection.phase === "intro"
  )
    return false;
  const r = object(v.result);
  const stage = beginnerStage(v.selection.stageId);
  if (
    !text(r.id) ||
    !text(r.runId) ||
    !finite(r.createdAt) ||
    r.completedAt !== r.createdAt ||
    !(r.startedAt === null || (finite(r.startedAt) && r.startedAt <= r.createdAt)) ||
    r.provenance !== "native" ||
    r.generatorVersion !== 1 ||
    !Array.isArray(r.notes) ||
    r.notes.length !== stage.targetCount
  )
    return false;
  const exercise = generateBeginnerExercise(v.selection);
  if (r.exerciseId !== exercise.id || r.seed !== v.selection.seed || r.task !== exercise.task)
    return false;
  const independent = v.selection.phase === "independent";
  const attemptIds = new Set<string>();
  return r.notes.every((value: unknown, index) => {
    const note = object(value),
      expected = exercise.song.notes[index];
    if (
      !expected ||
      note.noteId !== expected.id ||
      note.expectedMidi !== expected.pitch ||
      !finite(note.responseLatencyMs) ||
      !finite(note.presentedAtMs) ||
      !level(note.hintLevel) ||
      (independent && note.hintLevel !== 0) ||
      !Array.isArray(note.attempts) ||
      !note.attempts.length
    )
      return false;
    const attempts: readonly unknown[] = note.attempts;
    const valid = attempts.every((value, attemptIndex) => {
      const a = object(value);
      if (!text(a.attemptId) || attemptIds.has(a.attemptId)) return false;
      attemptIds.add(a.attemptId);
      return (
        a.runId === r.runId &&
        a.noteId === expected.id &&
        a.exerciseId === exercise.id &&
        a.expectedMidi === expected.pitch &&
        finite(a.playedMidi) &&
        Number.isInteger(a.playedMidi) &&
        a.playedMidi <= 127 &&
        finite(a.atMs) &&
        a.atMs >= (note.presentedAtMs as number) &&
        finite(a.responseLatencyMs) &&
        level(a.hintLevel) &&
        (!independent || a.hintLevel === 0) &&
        (a.inputSource === "midi" || a.inputSource === "keyboard" || a.inputSource === "pointer") &&
        (attemptIndex === attempts.length - 1
          ? a.playedMidi === expected.pitch
          : a.playedMidi !== expected.pitch)
      );
    });
    const last = object(attempts.at(-1));
    return (
      valid &&
      note.hintLevel === last.hintLevel &&
      note.responseLatencyMs === last.responseLatencyMs &&
      note.firstAttemptCorrect === (attempts.length === 1) &&
      note.independentCorrect === (attempts.length === 1 && last.hintLevel === 0) &&
      note.unassistedSolved === (last.hintLevel === 0)
    );
  });
}
