import type { Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { inputTokenId } from "../wordTyping/inputTokens";
import { columnKey, keyColumn } from "../wordTyping/keyboardRows";
import { laneSong } from "../wordTyping/laneSong";
import type { GeneratedToken, Modifier } from "../wordTyping/types";
import type { FrameState } from "./FallingNotesView";
import { FINGER_COLOR, TYPING_FINGER_COLOR } from "./fingerColors";
import { HAND_COLOR } from "./NotesLayer";

const BOTH_HANDS: ReadonlySet<Hand> = new Set(["left", "right"]);
const NOTHING: ReadonlySet<number> = new Set();
const MODIFIER_ORDER: Readonly<Record<Modifier, number>> = { none: 0, shift: 1, alt: 2 };

/**
 * The word mode's keys for the falling-notes view: each computer key is a column, and the
 * trainer's frames, which speak in real pitches, are told in columns. It draws nothing.
 */
export class ComputerKeys {
  /** The inputs on each key, by column: the plain one first, then Shift, then Alt. */
  readonly byColumn: ReadonlyMap<number, readonly GeneratedToken[]>;
  private readonly byNote: ReadonlyMap<string, GeneratedToken>;
  private realPitch: ReadonlyMap<string, number> = new Map();
  private laneById = new Map<string, SongNote>();
  /** The lane's notes of each real pitch, earliest first. */
  private byRealPitch = new Map<number, SongNote[]>();
  private order: readonly SongNote[] = [];
  /** The notes owed in the last frame told. */
  private due: readonly SongNote[] = [];
  /** The real pitch a mouse press sounded, for its release. */
  private pressed: number | undefined;

  constructor(tokens: readonly GeneratedToken[]) {
    this.byNote = new Map(tokens.map((token) => [token.noteId, token]));
    const byColumn = new Map<number, GeneratedToken[]>();
    const seen = new Set<string>();
    for (const token of tokens) {
      const column = keyColumn(token.input.physicalKey);
      const id = inputTokenId(token.input);
      if (column === undefined || seen.has(id)) continue;
      seen.add(id);
      byColumn.set(column, [...(byColumn.get(column) ?? []), token]);
    }
    for (const list of byColumn.values()) {
      list.sort((a, b) => MODIFIER_ORDER[a.input.modifier] - MODIFIER_ORDER[b.input.modifier]);
    }
    this.byColumn = byColumn;
  }

  /** A lane note's real pitch: what its card and its name show. */
  readonly writtenPitch = (note: SongNote): number => this.realPitch.get(note.id) ?? note.pitch;

  /** The song as the lane draws it, one column a key; the frames are told against it. */
  mapSong(song: Song): Song {
    const lane = laneSong(song, [...this.byNote.values()]);
    this.realPitch = lane.realPitch;
    this.order = lane.song.notes;
    this.laneById = new Map(lane.song.notes.map((note) => [note.id, note]));
    this.byRealPitch = new Map();
    for (const note of lane.song.notes) {
      const real = lane.realPitch.get(note.id);
      if (real === undefined) continue;
      this.byRealPitch.set(real, [...(this.byRealPitch.get(real) ?? []), note]);
    }
    this.due = [];
    return lane.song;
  }

  /** A trainer's frame told in columns: what is owed, held and graded, on which key. */
  frame(frame: FrameState): FrameState {
    const due = this.inLane(frame.due);
    this.due = due;
    const pressed = new Set<number>();
    for (const pitch of frame.pressed) {
      const column = this.columnOf(pitch, frame.time, due);
      if (column !== undefined) pressed.add(column);
    }
    const graded = frame.graded?.flatMap((strike) => {
      const column = this.columnOf(strike.pitch, frame.time, due);
      return column === undefined ? [] : [{ ...strike, pitch: column }];
    });
    return {
      ...frame,
      due,
      pressed,
      // The accompaniment sounds off the lane: no key of it lights.
      sounding: NOTHING,
      // Every note of the lane is the player's, whichever hand types it.
      hands: BOTH_HANDS,
      colorOf:
        frame.colorOf ??
        ((note) => (frame.statusOf(note.id) === "missed" ? undefined : this.colorOf(note))),
      ...(frame.waitingFor ? { waitingFor: this.inLane(frame.waitingFor) } : {}),
      ...(graded ? { graded } : {})
    };
  }

  /** The touch-typing colour of a lane note: the index fingers differ by hand. */
  colorOf(note: SongNote): number | undefined {
    return note.finger === undefined ? undefined : TYPING_FINGER_COLOR[note.hand][note.finger];
  }

  /** The note after the one owed in the last frame: its key is lit, dimmer, in advance. */
  next(): SongNote | undefined {
    const owed = this.due[0];
    if (!owed) return undefined;
    const index = this.order.indexOf(owed);
    return index < 0 ? undefined : this.order[index + 1];
  }

  /** The real pitch a mouse press on a key plays: the owed input if it is on that key. */
  press(column: number): number | undefined {
    const tokens = this.byColumn.get(column);
    const owed = this.due[0] && this.byNote.get(this.due[0].id);
    const token =
      owed && owed.input.physicalKey === columnKey(column)
        ? owed
        : (tokens?.find((item) => item.input.modifier === "none") ?? tokens?.[0]);
    this.pressed = token?.pitch;
    return this.pressed;
  }

  /** The real pitch the last mouse press sounded, now released. */
  release(): number | undefined {
    const pitch = this.pressed;
    this.pressed = undefined;
    return pitch;
  }

  private inLane(notes: readonly SongNote[]): SongNote[] {
    return notes.flatMap((note) => this.laneById.get(note.id) ?? []);
  }

  /** The column a real pitch is played on now: the owed note's, else the latest begun's. */
  private columnOf(real: number, time: number, due: readonly SongNote[]): number | undefined {
    for (const note of due) if (this.realPitch.get(note.id) === real) return note.pitch;
    const notes = this.byRealPitch.get(real);
    let found = notes?.[0];
    for (const note of notes ?? []) {
      if (note.start > time) break;
      found = note;
    }
    return found?.pitch;
  }
}

/** A note's colour on the keys and in the effects: its finger's, by the mode's palette. */
export function noteColor(note: SongNote, computer: ComputerKeys | undefined): number {
  return (
    computer?.colorOf(note) ??
    (note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand])
  );
}
