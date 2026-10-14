export function sessionErrorStats(
  wrong: readonly number[],
  missed: readonly number[],
  offsets: readonly number[]
) {
  const errors = new Map<number, number>();
  for (const pitch of [...wrong, ...missed]) errors.set(pitch, (errors.get(pitch) ?? 0) + 1);
  return {
    troubleSpots: [...errors]
      .map(([pitch, count]) => ({ pitch, errors: count }))
      .sort((a, b) => b.errors - a.errors || a.pitch - b.pitch)
      .slice(0, 5),
    meanOffset:
      offsets.length === 0 ? 0 : offsets.reduce((sum, value) => sum + value, 0) / offsets.length
  };
}
import type { PracticeOptions, PracticeStats, NoteStatus } from "./practiceTypes";
import type { NoteResult } from "./noteResult";
import type { SessionScoring } from "./sessionScoring";
import type { SessionHolds } from "./sessionHolds";

export function practiceStats(
  status: ReadonlyMap<string, NoteStatus>,
  wrong: readonly number[],
  missed: readonly number[],
  offsets: readonly number[],
  options: PracticeOptions,
  result: NoteResult,
  time: number,
  game: SessionScoring,
  holds: SessionHolds
): PracticeStats {
  let hits = 0;
  let misses = 0;
  for (const value of status.values()) {
    if (value === "hit") hits++;
    else if (value === "missed") misses++;
  }
  const errors = sessionErrorStats(wrong, missed, offsets);
  return {
    hits,
    misses,
    wrong: wrong.length,
    meanOffset: errors.meanOffset,
    troubleSpots: errors.troubleSpots,
    ...(options.noteResult !== false ? { noteResult: result.snapshot(time) } : {}),
    ...(options.mode === "tempo"
      ? { game: game.snapshot(time / options.speed), hold: holds.snapshot(time / options.speed) }
      : {})
  };
}
