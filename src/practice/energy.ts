import type { SongNote } from "../song/song";
import { GAME_RULES } from "./gameRules";

/** Fixed once for the assessed passage; notes are already scaled to performance seconds. */
export function energyPerHit(notes: readonly SongNote[]): number {
  if (notes.length === 0) return 0;
  let first = Infinity;
  let last = -Infinity;
  for (const note of notes) {
    first = Math.min(first, note.start);
    last = Math.max(last, note.start + note.duration);
  }
  const duration = Math.max(0, last - first);
  const budget = duration < 30 ? 125 : 175;
  return Math.min(budget / notes.length, GAME_RULES.overdriveCost);
}
