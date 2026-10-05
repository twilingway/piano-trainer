import type { Hand } from "../fingering/fingering";
import type { ComboBoard, GradedStrike } from "../practice/combo";
import type { NoteStatus } from "../practice/session";
import type { SongNote } from "../song/song";

export interface FrameState {
  /** Song seconds at the hit line. */
  readonly time: number;
  /** Song seconds between the top of the lane and the hit line. */
  readonly lookAhead: number;
  readonly statusOf: (noteId: string) => NoteStatus | undefined;
  /** Keys the player holds down right now. */
  readonly pressed: ReadonlySet<number>;
  /** Keys the program is sounding for the other hand. */
  readonly sounding: ReadonlySet<number>;
  /** The chord the player owes next, shown on the keyboard with its fingers. */
  readonly due: readonly SongNote[];
  /** The note a key answers now, which a per-word layout reads its letters from. */
  readonly owedNoteId?: string | undefined;
  /** All nearby pending player notes, including those behind an earlier unjudged note. */
  readonly hintNotes?: readonly SongNote[];
  /** Unshifted session seconds and playback rate used only for key cues. */
  readonly hintTime?: number;
  readonly hintSpeed?: number;
  /** Pending notes that currently freeze the session in wait mode. */
  readonly waitingFor?: readonly SongNote[];
  readonly hands: ReadonlySet<Hand>;
  /** Whether the player plays a note: in their hands and on their keyboard. */
  readonly owns: (note: SongNote) => boolean;
  readonly hints?: boolean;
  /** A colour of the caller's choosing (a review grade); notes it colours are drawn solid. */
  readonly colorOf?: ((note: SongNote) => number | undefined) | undefined;
  /** The combo and accuracy board; none on a view that only mirrors another. */
  readonly board?: ComboBoard;
  /** Strikes graded since the last frame, shown over their keys at the hit line. */
  readonly graded?: readonly GradedStrike[];
}
