import type { ReadingHintLevel, ReadingInputSource } from "./types";

export const READING_SKILL_ID = "note-reading";
export type ReadingPurpose = "notes" | "phrases" | "check" | "adaptive" | "delayed-check";
export type ReadingSourceFilter = ReadingInputSource | "all";

export interface ReadingPlan {
  readonly purpose: ReadingPurpose;
  readonly generatorVersion: number;
  readonly policyVersion: number;
  readonly source: ReadingSourceFilter;
  /** Integer quotas in C, D, E, F, G order. */
  readonly counts: readonly number[];
}

export interface ReadingHintEvent {
  readonly atMs: number;
  readonly level: ReadingHintLevel;
}

interface SkillEventIdentity {
  readonly exerciseId: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly inputSource: ReadingInputSource;
}

/** Future skill metrics cannot silently masquerade as note accuracy. */
export type LearningSkillEvent = SkillEventIdentity &
  (
    | {
        readonly skillId: "note-reading";
        readonly expectedMidi: number;
        readonly playedMidi: number;
      }
    | { readonly skillId: "rhythm"; readonly offsetMs: number }
    | {
        readonly skillId: "aural-interval";
        readonly expectedInterval: number;
        readonly playedInterval: number;
        readonly listeningCount: number;
      }
    | {
        readonly skillId: "chord";
        readonly expectedMidi: readonly number[];
        readonly playedMidi: readonly number[];
      }
  );

export interface ReadingObservation {
  readonly newMaterial?: boolean;
  readonly runId: string;
  readonly noteId: string;
  readonly purpose: ReadingPurpose;
  readonly completedAt: number;
  readonly expectedMidi: number;
  readonly inputSource: ReadingInputSource;
  readonly firstAttemptCorrect: boolean;
  readonly independentCorrect: boolean;
  readonly unassistedSolved: boolean;
  readonly firstLatencyMs: number | null;
  readonly responseLatencyMs: number | null;
  readonly errorCount: number;
}

export interface ReadingProfile {
  readonly observations: readonly ReadingObservation[];
  readonly processedRunIds: readonly string[];
  readonly delayedDueAt: number | null;
}

export interface ReadingMetrics {
  readonly observationCount: number;
  readonly errorCount: number;
  readonly firstAttemptCorrectCount: number;
  readonly independentCorrectCount: number;
  readonly unassistedSolvedCount: number;
  readonly independentRate: number | null;
  readonly firstLatencyMs: number | null;
  readonly responseLatencyMs: number | null;
  readonly independentLatencyMs: number | null;
  readonly newMaterialCount: number;
}

export interface ReadingNoteSummary extends ReadingMetrics {
  readonly expectedMidi: number;
}

export interface ReadingPurposeSummary {
  readonly purpose: ReadingPurpose;
  readonly rows: readonly ReadingNoteSummary[];
  readonly totals: ReadingMetrics;
}

export interface ReadingSummary {
  readonly source: ReadingSourceFilter;
  readonly purpose: ReadingPurpose | null;
  readonly rows: readonly ReadingNoteSummary[];
  readonly totals: ReadingMetrics;
  readonly byPurpose: readonly ReadingPurposeSummary[];
}
