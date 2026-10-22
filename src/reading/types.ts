import type { Song } from "../song/song";
import type { ReadingHintEvent, ReadingPlan } from "./progressTypes";

export type ReadingTask = "notes" | "phrases" | "check";
export type ReadingHintLevel = 0 | 1 | 2;
export type ReadingInputSource = "midi" | "keyboard" | "pointer";
export type ReadingSkillId = "note-reading" | "bass-note-reading";

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
  readonly skillId?: ReadingSkillId;
  readonly plan?: ReadingPlan;
  readonly id: string;
  readonly task: ReadingTask;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly musicXml: string;
  readonly song: Song;
}

export interface ReadingAttempt {
  readonly skillId?: ReadingSkillId;
  readonly runId?: string;
  readonly attemptId?: string;
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
  readonly hintHistory?: readonly ReadingHintEvent[] | null;
  readonly presentedAtMs?: number | null;
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
  readonly newMaterial?: boolean;
  readonly skillId?: ReadingSkillId;
  readonly generatorVersion?: number;
  readonly runId?: string;
  readonly startedAt?: number | null;
  readonly completedAt?: number;
  readonly plan?: ReadingPlan | null;
  readonly provenance?: "native" | "legacy";
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
