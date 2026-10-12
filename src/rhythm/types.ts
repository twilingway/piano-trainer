import type { Song } from "../song/song";

export type RhythmBpm = 60 | 80 | 100;
export type RhythmInputSource = "keyboard" | "pointer" | "midi";
export const RHYTHM_BPMS: readonly RhythmBpm[] = [60, 80, 100];
export const RHYTHM_RULES_VERSION = 1;
export const RHYTHM_WINDOW_MS = 150;
export const RHYTHM_DELIVERY_GRACE_MS = 250;

export interface RhythmOnset {
  readonly id: string;
  readonly timeS: number;
}

export interface RhythmRest {
  readonly startS: number;
  readonly endS: number;
}

export interface RhythmExercise {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly bpm: RhythmBpm;
  readonly musicXml: string;
  readonly song: Song;
  readonly onsets: readonly RhythmOnset[];
  readonly rests: readonly RhythmRest[];
  readonly durationS: number;
}

export interface RhythmOffsets {
  readonly inputOffsetMs: number;
  readonly manualInputOffsetMs: number;
  readonly audioOutputOffsetMs: number;
  readonly visualOffsetMs: number;
  readonly status: "calibrated" | "uncalibrated";
}

export interface RhythmSessionConfig {
  readonly runId: string;
  readonly source: RhythmInputSource;
  readonly deviceId?: string;
  readonly startedAt: number;
  readonly startedAtMs: number;
  readonly offsets: RhythmOffsets;
}

/** The shell supplies performance timestamps and musical times from its one clock. */
export interface RhythmAttackEvent {
  readonly runId: string;
  readonly source: RhythmInputSource;
  readonly deviceId?: string;
  readonly rawAtMs: number;
  readonly correctedAtMs: number;
  readonly receivedAtMs: number;
  readonly songTimeS: number;
  readonly receivedSongTimeS: number;
  readonly pitch?: number;
  readonly channel?: number;
}

export interface RhythmAttack extends RhythmAttackEvent {
  readonly attemptId: string;
  readonly kind: "hit" | "extra";
  readonly onsetId: string | null;
  readonly deviationMs: number | null;
  readonly inRest: boolean;
}

export interface RhythmMiss {
  readonly onsetId: string;
  readonly timeS: number;
  readonly source: RhythmInputSource;
}

export interface RhythmSummary {
  readonly expected: number;
  readonly hits: number;
  readonly early: number;
  readonly late: number;
  readonly misses: number;
  readonly extras: number;
  readonly restExtras: number;
  /** Matched attacks divided by expected attacks, from zero to one. */
  readonly hitRate: number;
  readonly signedMedianMs: number | null;
  readonly absoluteMedianMs: number | null;
}

export interface RhythmResult {
  readonly id: string;
  readonly skillId: "rhythm-onsets";
  readonly exerciseId: string;
  readonly runId: string;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly bpm: RhythmBpm;
  readonly source: RhythmInputSource;
  readonly deviceId?: string;
  readonly rulesVersion: number;
  readonly windowMs: number;
  readonly offsets: RhythmOffsets;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly attacks: readonly RhythmAttack[];
  readonly misses: readonly RhythmMiss[];
  readonly summary: RhythmSummary;
}

export interface RhythmSnapshot {
  readonly status: "running" | "completed" | "cancelled";
  readonly attacks: readonly RhythmAttack[];
  readonly misses: readonly RhythmMiss[];
  readonly summary: RhythmSummary;
}
