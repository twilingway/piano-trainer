import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";

/** A keyboard's lowest and highest key, MIDI numbers, both included. */
export interface PlayableRange {
  readonly low: number;
  readonly high: number;
}

/** Whether the player plays a note: it is in their hands and on their keyboard. */
export function ownsNote(
  note: SongNote,
  hands: ReadonlySet<Hand>,
  playable?: PlayableRange
): boolean {
  return (
    hands.has(note.hand) &&
    (playable === undefined || (note.pitch >= playable.low && note.pitch <= playable.high))
  );
}
