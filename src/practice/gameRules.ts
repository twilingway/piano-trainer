export type Difficulty = "easy" | "normal" | "hard" | "expert";
export type Judgement = "PERFECT" | "GREAT" | "GOOD" | "OK" | "MISS";
export type HitJudgement = Exclude<Judgement, "MISS">;

export interface TimingWindows {
  readonly perfect: number;
  readonly great: number;
  readonly good: number;
  readonly ok: number;
}

/** Inclusive timing windows, in milliseconds. */
export const DIFFICULTY_WINDOWS: Readonly<Record<Difficulty, TimingWindows>> = {
  easy: { perfect: 50, great: 90, good: 140, ok: 200 },
  normal: { perfect: 30, great: 60, good: 100, ok: 150 },
  hard: { perfect: 25, great: 50, good: 85, ok: 125 },
  expert: { perfect: 20, great: 40, good: 70, ok: 100 }
};

export const ACCURACY_POINTS: Readonly<Record<Judgement, number>> = {
  PERFECT: 100,
  GREAT: 80,
  GOOD: 50,
  OK: 25,
  MISS: 0
};

export const STREAK_BONUSES: Readonly<Record<number, number>> = {
  50: 500,
  100: 1000,
  250: 2500,
  500: 5000,
  1000: 10000
};

export const GAME_RULES = {
  chordWindowMs: 30,
  longNoteThresholdSeconds: 0.5,
  holdTickSeconds: 0.1,
  holdTickPoints: 10,
  flowStreak: 20,
  overdriveCost: 50,
  overdriveSeconds: 10
} as const;

export function difficultyWindows(difficulty: Difficulty = "normal"): TimingWindows {
  return DIFFICULTY_WINDOWS[difficulty];
}

export function judgeOffset(offsetMs: number, difficulty: Difficulty = "normal"): Judgement {
  const error = Math.abs(offsetMs);
  const windows = difficultyWindows(difficulty);
  if (error <= windows.perfect) return "PERFECT";
  if (error <= windows.great) return "GREAT";
  if (error <= windows.good) return "GOOD";
  if (error <= windows.ok) return "OK";
  return "MISS";
}

export function comboMultiplier(combo: number): number {
  if (combo >= 100) return 5;
  if (combo >= 50) return 4;
  if (combo >= 25) return 3;
  if (combo >= 10) return 2;
  return 1;
}

/** Floating point tolerance preserves an exact 100 ms boundary in song seconds. */
export function holdTicks(durationSeconds: number): number {
  return Math.max(0, Math.floor((durationSeconds + 1e-9) / GAME_RULES.holdTickSeconds));
}
