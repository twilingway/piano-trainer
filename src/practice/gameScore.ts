import {
  ACCURACY_POINTS,
  comboMultiplier,
  GAME_RULES,
  judgeOffset,
  STREAK_BONUSES
} from "./gameRules";
import type { Difficulty, Judgement } from "./gameRules";
import { rankForAccuracy, starsForScore, timingStatistics } from "./gameResults";
import type { GameRank, TimingStatistics } from "./gameResults";

export interface GameScoreOptions {
  readonly difficulty?: Difficulty;
  readonly learningWindow?: boolean;
  readonly targetScore?: number;
  readonly energyPerHit?: number;
}

export interface GameScoreSnapshot {
  readonly expectedNotes: number;
  readonly judgedNotes: number;
  readonly score: number;
  readonly combo: number;
  readonly multiplier: number;
  readonly maxCombo: number;
  readonly energy: number;
  readonly flow: boolean;
  readonly overdriveActive: boolean;
  readonly overdriveUntil: number;
  readonly grades: Readonly<Record<Judgement, number>>;
  readonly wrong: number;
  readonly chords: number;
  readonly partialChords: number;
  readonly holdScore: number;
  readonly overdriveScore: number;
  readonly accuracy: number | null;
  readonly rank: GameRank | null;
  readonly fullCombo: boolean;
  readonly perfectFullCombo: boolean;
  readonly targetScore: number;
  readonly stars: number | null;
  readonly timing: TimingStatistics;
}

/** Pure scorer. The session owns matching, chord finalization and hold lifetimes. */
export class GameScore {
  private readonly difficulty: Difficulty;
  private readonly learningWindow: boolean;
  private readonly targetScore: number;
  private readonly energyPerHit: number;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private energy = 0;
  private flowStreak = 0;
  private overdriveUntil = -Infinity;
  private readonly overdriveIntervals: { readonly start: number; readonly end: number }[] = [];
  private wrongCount = 0;
  private chordCount = 0;
  private partialCount = 0;
  private holdScore = 0;
  private overdriveScore = 0;
  private accuracyPoints = 0;
  private readonly grades: Record<Judgement, number> = {
    PERFECT: 0,
    GREAT: 0,
    GOOD: 0,
    OK: 0,
    MISS: 0
  };
  private readonly judged = new Map<string, Judgement>();
  private readonly chords = new Set<string>();
  private readonly awardedHoldTicks = new Map<string, number>();
  private readonly offsetsMs: number[] = [];

  constructor(
    readonly expectedNotes: number,
    options: GameScoreOptions = {}
  ) {
    if (!Number.isInteger(expectedNotes) || expectedNotes < 0) {
      throw new RangeError("Expected note count must be a nonnegative integer");
    }
    this.difficulty = options.difficulty ?? "normal";
    this.learningWindow = options.learningWindow === true;
    this.targetScore = options.targetScore ?? 0;
    this.energyPerHit = options.energyPerHit ?? 2;
  }

  hit(noteId: string, offsetMs: number, atSeconds: number): Judgement {
    const previous = this.judged.get(noteId);
    if (previous) return previous;
    const grade = judgeOffset(offsetMs, this.difficulty, this.learningWindow);
    if (grade === "MISS") {
      this.miss(noteId);
      return grade;
    }
    if (this.judged.size >= this.expectedNotes) return grade;
    this.judged.set(noteId, grade);
    this.grades[grade]++;
    this.offsetsMs.push(offsetMs);
    this.accuracyPoints += ACCURACY_POINTS[grade];
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.addPoints(ACCURACY_POINTS[grade], atSeconds);
    this.score += STREAK_BONUSES[this.combo] ?? 0;
    this.energy += this.energyPerHit;
    if (grade === "PERFECT" || grade === "GREAT") {
      this.flowStreak++;
    } else {
      this.flowStreak = 0;
    }
    return grade;
  }

  miss(noteId: string): void {
    if (this.judged.has(noteId) || this.judged.size >= this.expectedNotes) return;
    this.judged.set(noteId, "MISS");
    this.grades.MISS++;
    this.breakStreak();
  }

  /** Call only for a wrong key inside an active expected-note window. */
  wrong(): void {
    this.wrongCount++;
    this.breakStreak();
  }

  chord(chordId: string, complete: boolean): void {
    if (this.chords.has(chordId)) return;
    this.chords.add(chordId);
    this.chordCount++;
    if (!complete) {
      this.partialCount++;
      this.breakStreak();
    }
  }

  /** Total completed physical-hold ticks; duplicate updates never award twice. */
  hold(noteId: string, ticks: number, atSeconds: number): void {
    const grade = this.judged.get(noteId);
    if (!grade || grade === "MISS" || !Number.isFinite(ticks)) return;
    const completed = Math.max(0, Math.floor(ticks));
    const previous = this.awardedHoldTicks.get(noteId) ?? 0;
    if (completed <= previous) return;
    this.awardedHoldTicks.set(noteId, completed);
    const points = this.addPoints((completed - previous) * GAME_RULES.holdTickPoints, atSeconds);
    this.holdScore += points;
  }

  activateOverdrive(atSeconds: number): boolean {
    if (!Number.isFinite(atSeconds) || atSeconds < this.overdriveUntil) return false;
    if (this.energy + 1e-9 < GAME_RULES.overdriveCost) return false;
    this.energy = Math.max(0, this.energy - GAME_RULES.overdriveCost);
    this.overdriveUntil = atSeconds + GAME_RULES.overdriveSeconds;
    this.overdriveIntervals.push({ start: atSeconds, end: this.overdriveUntil });
    return true;
  }

  snapshot(atSeconds: number): GameScoreSnapshot {
    const overdriveActive = this.isOverdriveActive(atSeconds);
    const accuracy = this.expectedNotes ? this.accuracyPoints / this.expectedNotes : null;
    const fullCombo =
      this.expectedNotes > 0 &&
      this.judged.size === this.expectedNotes &&
      this.grades.MISS === 0 &&
      this.wrongCount === 0 &&
      this.partialCount === 0;
    return {
      expectedNotes: this.expectedNotes,
      judgedNotes: this.judged.size,
      score: this.score,
      combo: this.combo,
      multiplier: comboMultiplier(this.combo) * (overdriveActive ? 2 : 1),
      maxCombo: this.maxCombo,
      energy: Math.floor(this.energy + 1e-9),
      flow: this.flowStreak >= GAME_RULES.flowStreak,
      overdriveActive,
      overdriveUntil: Number.isFinite(this.overdriveUntil) ? this.overdriveUntil : 0,
      grades: { ...this.grades },
      wrong: this.wrongCount,
      chords: this.chordCount,
      partialChords: this.partialCount,
      holdScore: this.holdScore,
      overdriveScore: this.overdriveScore,
      accuracy,
      rank: accuracy === null ? null : rankForAccuracy(accuracy),
      fullCombo,
      perfectFullCombo: fullCombo && this.grades.PERFECT === this.expectedNotes,
      targetScore: this.targetScore,
      stars: this.expectedNotes ? starsForScore(this.score, this.targetScore) : null,
      timing: timingStatistics(this.offsetsMs)
    };
  }

  private breakStreak(): void {
    this.combo = 0;
    this.flowStreak = 0;
  }

  private addPoints(base: number, atSeconds: number): number {
    const regular = base * comboMultiplier(this.combo);
    const bonus = this.isOverdriveActive(atSeconds) ? regular : 0;
    this.score += regular + bonus;
    this.overdriveScore += bonus;
    return regular + bonus;
  }

  private isOverdriveActive(atSeconds: number): boolean {
    return this.overdriveIntervals.some(({ start, end }) => atSeconds >= start && atSeconds < end);
  }
}
