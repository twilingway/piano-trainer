import type { Texture } from "pixi.js";

import type { SongNote } from "../song/song";
import { FINGER_COLOR, HAND_COLOR } from "./fingerColors";

/** How the falling notes show a note: written as which note, and in which colour. */
export interface NoteLook {
  /** The note as the card and the name show it: its pitch and hand on the staff. */
  readonly written: (note: SongNote) => SongNote;
  /** Its colour on the lane, on its key and in its effects. */
  readonly color: (note: SongNote) => number;
  /** What a note carries instead of its finger's digit, if anything: the word mode's letter. */
  readonly badge?: (note: SongNote) => Texture | undefined;
}

/** The piano's look: each note as it is, in its finger's colour, else its hand's. */
export const PIANO_LOOK: NoteLook = {
  written: (note) => note,
  color: (note) => (note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand])
};
