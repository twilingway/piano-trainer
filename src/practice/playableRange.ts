import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";

/** A keyboard's lowest and highest key, MIDI numbers, both included. */
export interface PlayableRange {
  readonly low: number;
  readonly high: number;
}

/**
 * Whether the player plays a note: it is in their hands, on their keyboard and,
 * when they chose parts of the song, in one of those parts.
 */
export function ownsNote(
  note: SongNote,
  hands: ReadonlySet<Hand>,
  playable?: PlayableRange,
  parts?: ReadonlySet<string>
): boolean {
  return (
    hands.has(note.hand) &&
    (playable === undefined || (note.pitch >= playable.low && note.pitch <= playable.high)) &&
    (parts === undefined || (note.part !== undefined && parts.has(note.part)))
  );
}
