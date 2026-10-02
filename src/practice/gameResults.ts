import { comboMultiplier, GAME_RULES, holdTicks, STREAK_BONUSES } from "./gameRules";

export type GameRank = "S+" | "S" | "A+" | "A" | "B" | "C" | "D" | "F";

export function rankForAccuracy(accuracy: number): GameRank {
  if (accuracy >= 100) return "S+";
  if (accuracy >= 98) return "S";
  if (accuracy >= 95) return "A+";
  if (accuracy >= 90) return "A";
  if (accuracy >= 85) return "B";
  if (accuracy >= 75) return "C";
  if (accuracy >= 60) return "D";
  return "F";
}

export function starsForScore(score: number, targetScore: number): number | null {
  if (targetScore <= 0) return null;
  const fraction = score / targetScore;
  if (fraction >= 0.85) return 5;
  if (fraction >= 0.7) return 4;
  if (fraction >= 0.5) return 3;
  if (fraction >= 0.3) return 2;
  return 1;
}

export interface TimingStatistics {
  readonly meanMs: number | null;
  readonly medianMs: number | null;
  readonly early: number;
  readonly late: number;
  readonly exact: number;
  /** Ten millisecond buckets; the key is the inclusive lower bound. */
  readonly histogram: readonly { readonly fromMs: number; readonly count: number }[];
}

export function timingStatistics(offsetsMs: readonly number[]): TimingStatistics {
  const sorted = offsetsMs.filter(Number.isFinite).toSorted((a, b) => a - b);
  const size = sorted.length;
  const bins = new Map<number, number>();
  for (const offset of sorted) {
    const from = Math.floor(offset / 10) * 10;
    bins.set(from, (bins.get(from) ?? 0) + 1);
  }
  const middle = Math.floor(size / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? upper;
  return {
    meanMs: size ? sorted.reduce((sum, offset) => sum + offset, 0) / size : null,
    medianMs: size ? (size % 2 ? upper : (lower + upper) / 2) : null,
    early: sorted.filter((offset) => offset < 0).length,
    late: sorted.filter((offset) => offset > 0).length,
    exact: sorted.filter((offset) => offset === 0).length,
    histogram: [...bins].map(([fromMs, count]) => ({ fromMs, count }))
  };
}

interface IdealNote {
  readonly start: number;
  readonly duration: number;
}

/** Perfect attacks and full physical holds, without Overdrive. Times are seconds. */
export function idealScore(notes: readonly IdealNote[]): number {
  const events: { time: number; attack: boolean }[] = [];
  for (const note of notes) {
    events.push({ time: note.start, attack: true });
    if (note.duration < GAME_RULES.longNoteThresholdSeconds) continue;
    for (let tick = 1; tick <= holdTicks(note.duration); tick++) {
      events.push({ time: note.start + tick * GAME_RULES.holdTickSeconds, attack: false });
    }
  }
  events.sort((a, b) => a.time - b.time || Number(b.attack) - Number(a.attack));
  let combo = 0;
  let score = 0;
  for (const event of events) {
    if (event.attack) combo++;
    score += (event.attack ? 100 : GAME_RULES.holdTickPoints) * comboMultiplier(combo);
    if (event.attack) score += STREAK_BONUSES[combo] ?? 0;
  }
  return score;
}
