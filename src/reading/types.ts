import type { Song } from "../song/song";

export type ReadingTask = "notes" | "phrases" | "check";
export type ReadingHintLevel = 0 | 1 | 2;
export type ReadingInputSource = "midi" | "keyboard" | "pointer";

export interface ReadingPreferences {
  readonly automaticHints: boolean;
  readonly nameDelayMs: number;
  readonly keyDelayMs: number;
}

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  automaticHints: true,
  nameDelayMs: 5_000,
  keyDelayMs: 10_000
};

export interface ReadingExercise {
  readonly id: string;
  readonly task: ReadingTask;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly musicXml: string;
  readonly song: Song;
}

export interface ReadingAttempt {
  readonly exerciseId: string;
  readonly noteId: string;
  readonly expectedMidi: number;
  readonly playedMidi: number;
  readonly responseLatencyMs: number;
  readonly hintLevel: ReadingHintLevel;
  readonly inputSource: ReadingInputSource;
  readonly atMs: number;
}

export interface ReadingNoteResult {
  readonly noteId: string;
  readonly expectedMidi: number;
  readonly firstAttemptCorrect: boolean;
  readonly independentCorrect: boolean;
  readonly unassistedSolved: boolean;
  readonly responseLatencyMs: number;
  readonly hintLevel: ReadingHintLevel;
  readonly attempts: readonly ReadingAttempt[];
}

export interface ReadingResult {
  readonly id: string;
  readonly exerciseId: string;
  readonly task: ReadingTask;
  readonly seed: number;
  readonly createdAt: number;
  readonly notes: readonly ReadingNoteResult[];
}

export interface ReadingSnapshot {
  readonly noteId: string | null;
  readonly hintLevel: ReadingHintLevel;
  readonly answers: readonly ReadingNoteResult[];
  readonly active: boolean;
  readonly completed: boolean;
  readonly presented: boolean;
}
