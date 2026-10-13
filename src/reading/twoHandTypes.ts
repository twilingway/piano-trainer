import type { Song } from "../song/song";
import type { ReadingHintLevel, ReadingInputSource } from "./types";

export const TWO_HAND_SKILL_ID = "two-hand-coordination";
export const TWO_HAND_GENERATOR_VERSION = 1;
export const TWO_HAND_WINDOW_MS = 200;
export const TWO_HAND_HORIZON_MS = 250;
export interface TwoHandPair {
  readonly id: string;
  readonly noteIds: readonly [string, string];
  readonly pitches: readonly [number, number];
}
export interface TwoHandExercise {
  readonly skillId: typeof TWO_HAND_SKILL_ID;
  readonly task: "simultaneous";
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly pairs: readonly TwoHandPair[];
  readonly musicXml: string;
  readonly song: Song;
}
export interface TwoHandInput {
  readonly kind: "down" | "up";
  readonly pitch: number;
  readonly source: ReadingInputSource;
  readonly atMs: number;
  readonly offsetMs?: number;
  readonly deviceId?: string;
  readonly channel?: number;
  readonly ownerId?: string;
  readonly runId?: string;
  readonly presentationId?: string;
}
export interface TwoHandEvent extends TwoHandInput {
  readonly receivedAtMs: number;
  readonly sequence: number;
}
export type TwoHandFailure =
  "wrong-note" | "too-slow" | "early-release" | "third-note" | "mixed-origin";
export type TwoHandStatus =
  "unpresented" | "ready" | "waiting-second" | "release" | "overflow" | TwoHandFailure;
export interface TwoHandInterval {
  readonly from: number;
  readonly to: number;
}
export interface TwoHandHint {
  readonly atMs: number;
  readonly level: ReadingHintLevel;
}
export interface TwoHandAttempt {
  readonly attemptId: string;
  readonly presentationId: string;
  readonly boundaryAtMs: number;
  readonly events: readonly TwoHandEvent[];
  readonly outcome: "success" | TwoHandFailure;
  readonly inputSource: ReadingInputSource;
  readonly offsetMs: number;
  readonly firstDownAtMs: number;
  readonly secondDownAtMs: number | null;
  readonly releasedAtMs: number;
  readonly finalizedAtMs: number;
  readonly spreadMs: number | null;
}
export interface TwoHandPairResult {
  readonly pairId: string;
  readonly noteIds: readonly [string, string];
  readonly expectedMidi: readonly [number, number];
  readonly presentedAtMs: number;
  readonly activeIntervals: readonly TwoHandInterval[];
  readonly hintHistory: readonly TwoHandHint[];
  readonly attempts: readonly TwoHandAttempt[];
  readonly firstAttemptCorrect: boolean;
  readonly independentCorrect: boolean;
  readonly unassistedSolved: boolean;
  readonly hintLevel: ReadingHintLevel;
  readonly firstLatencyMs: number;
  readonly responseLatencyMs: number;
  readonly spreadMs: number;
}
export interface TwoHandResult {
  readonly id: string;
  readonly runId: string;
  readonly skillId: typeof TWO_HAND_SKILL_ID;
  readonly task: "simultaneous";
  readonly exerciseId: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly createdAt: number;
  readonly pairs: readonly TwoHandPairResult[];
}
export interface TwoHandCommit {
  readonly pairId: string;
  readonly presentationId: string;
  readonly noteIds: readonly [string, string];
  readonly atMs: number;
}
export interface TwoHandSnapshot {
  readonly pairId: string | null;
  readonly pairIndex: number;
  readonly presentationId: string | null;
  readonly status: TwoHandStatus;
  readonly hintLevel: ReadingHintLevel;
  readonly active: boolean;
  readonly presented: boolean;
  readonly completed: boolean;
  readonly answers: readonly TwoHandPairResult[];
  readonly lastCommit: TwoHandCommit | null;
}
