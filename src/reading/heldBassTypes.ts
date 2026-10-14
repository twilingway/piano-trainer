import type { ClockSegment } from "../practice/timing";
import type { Song } from "../song/song";
import type { TwoHandEvent, TwoHandInput, TwoHandInterval } from "./twoHandTypes";
import type { ReadingHintLevel, ReadingInputSource } from "./types";

export const HELD_BASS_SKILL_ID = "held-bass-reading";
export const HELD_BASS_GENERATOR_VERSION = 1;
export const HELD_BASS_HORIZON_MS = 250;
export interface HeldBassFragment {
  readonly id: string;
  readonly bassPitch: number;
  readonly melodyPitches: readonly number[];
  readonly bassNoteId: string;
  readonly melodyNoteIds: readonly string[];
  readonly steps: readonly (readonly string[])[];
  readonly musicXml: string;
  readonly song: Song;
}
export interface HeldBassExercise {
  readonly skillId: typeof HELD_BASS_SKILL_ID;
  readonly task: "held-bass";
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly fragments: readonly HeldBassFragment[];
}
export type HeldBassInput = TwoHandInput;
export type HeldBassEvent = TwoHandEvent;
export interface HeldBassClockReceipt {
  readonly segments: readonly ClockSegment[];
  readonly songTime: number;
  readonly waiting: boolean;
  readonly ended: boolean;
  readonly dueNoteIds: readonly string[];
  readonly atMs: number;
}
export interface HeldBassCommit {
  readonly runId: string;
  readonly fragmentId: string;
  readonly presentationId: string;
  readonly step: number;
  readonly noteIds: readonly string[];
  readonly atMs: number;
}
export interface HeldBassOnset extends HeldBassCommit {
  readonly attackAtMs: number;
}
export type HeldBassFailure =
  | "wrong-note"
  | "too-slow"
  | "early-release"
  | "early-melody"
  | "third-note"
  | "mixed-origin"
  | "too-many-melody";
export type HeldBassStatus =
  | "unpresented"
  | "ready"
  | "waiting-second"
  | "travelling"
  | "hold"
  | "release"
  | "retry"
  | "overflow"
  | HeldBassFailure;
export interface HeldBassHint {
  readonly presentationId: string;
  readonly presentedAtMs: number;
  readonly step: number;
  readonly atMs: number;
  readonly level: ReadingHintLevel;
}
export interface HeldBassAttempt {
  readonly attemptId: string;
  readonly presentationId: string;
  readonly presentedAtMs: number;
  readonly boundaryAtMs: number;
  readonly activeIntervals: readonly TwoHandInterval[];
  readonly events: readonly HeldBassEvent[];
  readonly clock: readonly ClockSegment[];
  readonly onsets: readonly HeldBassOnset[];
  readonly outcome: "success" | HeldBassFailure;
  readonly inputSource: ReadingInputSource;
  readonly offsetMs: number;
  readonly firstDownAtMs: number;
  readonly secondDownAtMs: number | null;
  readonly spreadMs: number | null;
  readonly rawEndAtMs: number | null;
  readonly releasedAtMs: number;
  readonly finalizedAtMs: number;
}
export interface HeldBassFragmentResult {
  readonly fragmentId: string;
  readonly bassPitch: number;
  readonly melodyPitches: readonly number[];
  readonly hintHistory: readonly HeldBassHint[];
  readonly attempts: readonly HeldBassAttempt[];
  readonly firstAttemptCorrect: boolean;
  readonly independentCorrect: boolean;
  readonly unassistedSolved: boolean;
  readonly hintLevel: ReadingHintLevel;
  readonly firstLatencyMs: number;
  readonly responseLatencyMs: number;
  readonly spreadMs: number;
  readonly heldDurationMs: number;
}
export interface HeldBassResult {
  readonly id: string;
  readonly runId: string;
  readonly skillId: typeof HELD_BASS_SKILL_ID;
  readonly task: "held-bass";
  readonly exerciseId: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly createdAt: number;
  readonly fragments: readonly HeldBassFragmentResult[];
}
export interface HeldBassRetry {
  readonly fragmentId: string;
  readonly revision: number;
}
export interface HeldBassSnapshot {
  readonly fragmentId: string | null;
  readonly fragmentIndex: number;
  readonly presentationId: string | null;
  readonly step: number;
  readonly status: HeldBassStatus;
  readonly ready: boolean;
  readonly bassPitch: number | null;
  readonly targetPitch: number | null;
  readonly hintLevel: ReadingHintLevel;
  readonly active: boolean;
  readonly presented: boolean;
  readonly completed: boolean;
  readonly answers: readonly HeldBassFragmentResult[];
  readonly pendingCommit: HeldBassCommit | null;
  readonly retryCommand: HeldBassRetry | null;
}
