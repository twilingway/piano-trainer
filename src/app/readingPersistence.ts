import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import type { ReadingResult, ReadingTask } from "../reading/types";
import {
  initialReadingState,
  normalizeReadingPreferences,
  type ReadingRoot,
  type ReadingState
} from "./readingSlice";
import {
  browserPreferenceStorage,
  persistenceKey,
  type PreferenceRoot,
  type PreferenceStorage
} from "./preferencePersistence";
import { persistenceErrorChanged } from "./persistenceSlice";

export const READING_STORAGE_KEY = "reading-course-v1";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const task = (value: unknown): value is ReadingTask =>
  value === "notes" || value === "phrases" || value === "check";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const pitch = (value: unknown) => finite(value) && Number.isInteger(value) && value <= 127;
const level = (value: unknown) => value === 0 || value === 1 || value === 2;

function validResult(value: unknown): value is ReadingResult {
  const row = object(value);
  if (
    typeof row.id !== "string" ||
    typeof row.exerciseId !== "string" ||
    !task(row.task) ||
    !finite(row.seed) ||
    !finite(row.createdAt) ||
    !Array.isArray(row.notes) ||
    row.notes.length !== 20
  )
    return false;
  return row.notes.every((value) => {
    const note = object(value);
    return (
      typeof note.noteId === "string" &&
      [60, 62, 64, 65, 67].includes(Number(note.expectedMidi)) &&
      [note.firstAttemptCorrect, note.independentCorrect, note.unassistedSolved].every(
        (value) => typeof value === "boolean"
      ) &&
      finite(note.responseLatencyMs) &&
      level(note.hintLevel) &&
      Array.isArray(note.attempts) &&
      note.attempts.length > 0 &&
      note.attempts.every((value) => {
        const attempt = object(value);
        return (
          attempt.noteId === note.noteId &&
          attempt.exerciseId === row.exerciseId &&
          attempt.expectedMidi === note.expectedMidi &&
          pitch(attempt.playedMidi) &&
          finite(attempt.responseLatencyMs) &&
          finite(attempt.atMs) &&
          level(attempt.hintLevel) &&
          ["midi", "keyboard", "pointer"].includes(String(attempt.inputSource))
        );
      })
    );
  });
}

export function loadReadingState(storage: PreferenceStorage = browserPreferenceStorage()): {
  reading: ReadingState;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const reading: ReadingState = { ...initialReadingState, history: [] };
  try {
    const raw = storage.getItem(READING_STORAGE_KEY);
    if (raw === null) return { reading, errors };
    const parsed: unknown = JSON.parse(raw);
    const row = object(parsed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    reading.task = task(row.task) ? row.task : null;
    reading.seed = finite(row.seed) ? row.seed >>> 0 : 1;
    reading.preferences = normalizeReadingPreferences(object(row.preferences));
    const history = Array.isArray(row.history) ? row.history : [];
    if (history.some((result) => !validResult(result)))
      errors[persistenceKey(READING_STORAGE_KEY, "read")] = "invalid";
    const valid = history.filter(validResult);
    reading.history = (["notes", "phrases", "check"] as const).flatMap((task) =>
      valid.filter((result) => result.task === task).slice(-20)
    );
  } catch (error) {
    errors[persistenceKey(READING_STORAGE_KEY, "read")] =
      error instanceof SyntaxError || (error instanceof Error && error.message === "invalid")
        ? "invalid"
        : "unavailable";
  }
  return { reading, errors };
}

export function registerReadingPersistence<State extends PreferenceRoot & ReadingRoot>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage
) {
  return listener.startListening({
    predicate: (_action, current, previous) => current.reading !== previous.reading,
    effect: (_action, api) => {
      const key = persistenceKey(READING_STORAGE_KEY, "write");
      try {
        storage.setItem(READING_STORAGE_KEY, JSON.stringify(api.getState().reading));
        api.dispatch(persistenceErrorChanged({ key, error: null }));
      } catch {
        api.dispatch(persistenceErrorChanged({ key, error: "unavailable" }));
      }
    }
  });
}
