import type { PracticeSession } from "./session";

/**
 * The keys to light on the player's instrument: the ones the screen keyboard
 * cues (`keyHints`), from 300 ms before their notes, in both modes; the wait
 * mode keeps them lit while it holds the song. Each key once; none while
 * `active` is false.
 */
export function keyLightPitches(session: PracticeSession, active: boolean): number[] {
  if (!active) return [];
  return [...new Set(session.keyHints().map((note) => note.pitch))];
}
