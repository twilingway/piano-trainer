import type { ClockSegment } from "../practice/timing";
import type { Song } from "../song/song";
import type { TwoHandEvent, TwoHandInput } from "../reading/twoHandTypes";
import type { ReadingInputSource } from "../reading/types";

export const INDEPENDENT_RHYTHM_SKILL_ID = "independent-rhythm-reading";
export const INDEPENDENT_RHYTHM_GENERATOR_VERSION = 1;
export const INDEPENDENT_RHYTHM_RULES_VERSION = 1;
export type IndependentRhythmPhase = "pulse" | "two-hands";
export interface IndependentRhythmPhaseExercise {
  readonly id: string;
  readonly phase: IndependentRhythmPhase;
  readonly musicXml: string;
  readonly song: Song;
}
export interface IndependentRhythmExercise {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly rulesVersion: 1;
  readonly skillId: typeof INDEPENDENT_RHYTHM_SKILL_ID;
  readonly order: readonly ("A" | "B")[];
  readonly pulse: IndependentRhythmPhaseExercise;
  readonly series: IndependentRhythmPhaseExercise;
}
export interface IndependentRhythmConfig {
  readonly runId: string;
  readonly presentationId: string;
  readonly source: ReadingInputSource;
  readonly deviceId?: string;
  readonly channel?: number;
  readonly offsetMs: number;
}
export type IndependentRhythmInput = TwoHandInput;
export type IndependentRhythmEvent = TwoHandEvent;
export interface IndependentRhythmClockReceipt {
  readonly segments: readonly ClockSegment[];
  readonly atMs: number;
  readonly songTime: number;
  readonly startPerformanceMs: number | null;
  readonly endPerformanceMs: number | null;
  readonly ended: boolean;
}
export interface IndependentRhythmNoteOutcome {
  readonly noteId: string;
  readonly pitch: number;
  readonly hand: "left" | "right";
  readonly onset: number;
  readonly outcome: "pending" | "hit" | "miss";
  readonly eventSequence: number | null;
  readonly deviationMs: number | null;
}
export interface IndependentRhythmExtra {
  readonly eventSequence: number;
  readonly pitch: number;
  readonly hand: "left" | "right" | null;
  readonly songTime: number;
}
export interface IndependentRhythmHandSummary {
  readonly expected: number;
  readonly hits: number;
  readonly misses: number;
  readonly extras: number;
  readonly early: number;
  readonly late: number;
  readonly signedDeviationMs: number | null;
  readonly absoluteDeviationMs: number | null;
}
export interface IndependentRhythmSummary {
  readonly left: IndependentRhythmHandSummary;
  readonly right: IndependentRhythmHandSummary;
  readonly extras: number;
  readonly unknownExtras: number;
  readonly spreadMs: number | null;
}
export interface IndependentRhythmHelpReceipt {
  readonly presentationId: string;
  readonly atMs: number;
  readonly pitches: readonly number[];
}
export interface IndependentRhythmPhaseResult {
  readonly phaseId: string;
  readonly phase: IndependentRhythmPhase;
  readonly config: IndependentRhythmConfig;
  readonly musicXml: string;
  readonly scoreFingerprint: string;
  readonly presentedAtMs: number;
  readonly startedAtMs: number;
  readonly finalizedAtMs: number;
  readonly clock: IndependentRhythmClockReceipt;
  readonly events: readonly IndependentRhythmEvent[];
  readonly help: readonly IndependentRhythmHelpReceipt[];
  readonly channel: number | null;
  readonly outcomes: readonly IndependentRhythmNoteOutcome[];
  readonly extras: readonly IndependentRhythmExtra[];
  readonly summary: IndependentRhythmSummary;
  readonly passed: boolean;
}
export interface IndependentRhythmResult {
  readonly id: string;
  readonly runId: string;
  readonly skillId: typeof INDEPENDENT_RHYTHM_SKILL_ID;
  readonly task: "independent-rhythms";
  readonly exerciseId: string;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly rulesVersion: 1;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly createdAt: number;
  readonly inputSource: ReadingInputSource;
  readonly pulse: IndependentRhythmPhaseResult;
  readonly series: IndependentRhythmPhaseResult;
}
export type IndependentRhythmStatus =
  | "unpresented"
  | "preparation"
  | "blocked"
  | "count-in"
  | "playing"
  | "finalizing"
  | "passed"
  | "failed"
  | "result"
  | "cancelled"
  | "overflow";
export interface IndependentRhythmSnapshot {
  readonly phase: IndependentRhythmPhase;
  readonly status: IndependentRhythmStatus;
  readonly prepared: boolean;
  readonly presented: boolean;
  readonly active: boolean;
  readonly blocked: boolean;
  readonly finished: boolean;
  readonly passed: boolean;
  readonly countInBeat: number | null;
  readonly channel: number | null;
  readonly outcomes: readonly IndependentRhythmNoteOutcome[];
  readonly extras: readonly IndependentRhythmExtra[];
  readonly summary: IndependentRhythmSummary;
}
