import type { Song } from "../song/song";

export type IntervalMode = "see-and-play" | "hear-and-choose";
export type IntervalCategory = "repeat" | "step-up" | "step-down" | "third-up" | "third-down";
export type IntervalInputSource = "midi" | "keyboard" | "pointer";
export type IntervalSourceFilter = "all" | IntervalInputSource;
export type IntervalSkillId = "interval-pair-playing" | "aural-interval";
export type IntervalNoteRole = 0 | 1;
export type IntervalResponseKind = "piano-pair" | "category-choice";

export const INTERVAL_CATEGORIES: readonly IntervalCategory[] = [
  "repeat",
  "step-up",
  "step-down",
  "third-up",
  "third-down"
];

export interface IntervalPair {
  readonly questionId: string;
  readonly index: number;
  readonly category: IntervalCategory;
  readonly anchorMidi: number;
  readonly targetMidi: number;
  readonly noteIds: readonly [string, string];
}

export interface IntervalExercise {
  readonly id: string;
  readonly mode: IntervalMode;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly pairs: readonly IntervalPair[];
  readonly musicXml: string;
  readonly song: Song;
}

export interface IntervalIdentity {
  readonly runId: string;
  readonly questionId: string;
}

export interface IntervalAttemptIdentity extends IntervalIdentity {
  readonly skillId: IntervalSkillId;
  readonly exerciseId: string;
  readonly attemptId: string;
  readonly inputSource: IntervalInputSource;
  readonly atMs: number;
  readonly responseLatencyMs: number;
  readonly helpShown: boolean;
  readonly correct: boolean;
}

export interface IntervalPitchAttempt extends IntervalAttemptIdentity {
  readonly responseKind: "piano-pair";
  readonly noteRole: IntervalNoteRole;
  readonly expectedMidi: number;
  readonly playedMidi: number;
}

export interface IntervalChoiceAttempt extends IntervalAttemptIdentity {
  readonly responseKind: "category-choice";
  readonly inputSource: "keyboard" | "pointer";
  readonly expectedCategory: IntervalCategory;
  readonly chosenCategory: IntervalCategory;
}

export type IntervalAttempt = IntervalPitchAttempt | IntervalChoiceAttempt;
export interface IntervalHelpEvent {
  readonly atMs: number;
}

export interface IntervalQuestionResult {
  readonly questionId: string;
  readonly category: IntervalCategory;
  readonly anchorMidi: number;
  readonly targetMidi: number;
  readonly inputSource: IntervalInputSource;
  readonly responseKind: IntervalResponseKind;
  readonly firstAttemptCorrect: boolean;
  readonly independentCorrect: boolean;
  readonly unassistedSolved: boolean;
  readonly firstListeningCorrect: boolean | null;
  readonly firstReactionMs: number;
  readonly solutionMs: number;
  readonly fullListeningCount: number;
  readonly partialListeningCount: number;
  readonly presentedAtMs: number | null;
  readonly attempts: readonly IntervalAttempt[];
  readonly helpHistory: readonly IntervalHelpEvent[];
}

export interface IntervalResult {
  readonly id: string;
  readonly skillId: IntervalSkillId;
  readonly runId: string;
  readonly exerciseId: string;
  readonly mode: IntervalMode;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly startedAt: number | null;
  readonly completedAt: number;
  readonly createdAt: number;
  readonly questions: readonly IntervalQuestionResult[];
}

export interface IntervalSnapshot {
  readonly questionIndex: number;
  readonly questionId: string | null;
  readonly noteRole: IntervalNoteRole;
  readonly expectedNoteId: string | null;
  readonly expectedMidi: number | null;
  readonly answers: readonly IntervalQuestionResult[];
  readonly attempts: readonly IntervalAttempt[];
  readonly errorCount: number;
  readonly active: boolean;
  readonly presented: boolean;
  readonly canAnswer: boolean;
  readonly helpShown: boolean;
  readonly listening: boolean;
  readonly fullListeningCount: number;
  readonly partialListeningCount: number;
  readonly completed: boolean;
}
