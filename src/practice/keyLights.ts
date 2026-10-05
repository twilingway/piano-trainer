import type { PracticeSession } from "./session";

/**
 * The keys to light on the player's instrument: the chord the wait mode holds
 * for, or in the tempo mode the notes the screen keyboard already cues
 * (`keyHints`). Each key once; none while `active` is false.
 */
export function keyLightPitches(session: PracticeSession, active: boolean): number[] {
  if (!active) return [];
  const notes = session.options.mode === "wait" ? session.nextDue() : session.keyHints();
  return [...new Set(notes.map((note) => note.pitch))];
}
