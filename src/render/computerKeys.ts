import type { Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { inputTokenId } from "../wordTyping/inputTokens";
import { columnKey, keyColumn } from "../wordTyping/keyboardRows";
import { laneSong } from "../wordTyping/laneSong";
import type { GeneratedToken, Language, Modifier } from "../wordTyping/types";
import type { Texture } from "pixi.js";
import type { FrameState } from "./FallingNotesView";
import { TYPING_FINGER_COLOR } from "./fingerColors";
import { PIANO_LOOK } from "./noteLook";
import type { NoteLook } from "./noteLook";

/** The word mode's keyboard: what each key types and plays, and in which language. */
export interface ComputerKeyboard {
  readonly tokens: readonly GeneratedToken[];
  readonly language: Language;
}

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
  /** The song's own notes by id: what the cards and the names show. */
  private realNotes = new Map<string, SongNote>();
  private laneById = new Map<string, SongNote>();
  /** The lane's notes of each real pitch, earliest first. */
  private byRealPitch = new Map<number, SongNote[]>();
  private order: readonly SongNote[] = [];
  /** The notes owed in the last frame told. */
  private due: readonly SongNote[] = [];
  /** The real pitch a mouse press sounded, for its release. */
  private pressed: number | undefined;
  /** The key the mouse holds, as a column. */
  private mouseColumn: number | undefined;
  /** Keys held down now, by column, the latest last: they light, and strikes land on them. */
  private held: number[] = [];

  /**
   * `language` says what the keys without an input type, for their captions; `letter` draws the
   * letter a note carries, once a letter.
   */
  constructor(
    tokens: readonly GeneratedToken[],
    readonly language: Language,
    private readonly letter?: (text: string) => Texture
  ) {
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

  /** The lane's look: the touch-typing palette; cards and names show the note itself. */
  readonly look: NoteLook = {
    written: (note) => this.realNotes.get(note.id) ?? note,
    color: (note) => this.colorOf(note) ?? PIANO_LOOK.color(note),
    // The letter to press, not the finger: the colour already tells the finger.
    badge: (note) => {
      const token = this.byNote.get(note.id);
      return token && this.letter?.(letterOf(token));
    }
  };

  /** The song as the lane draws it, one column a key; the frames are told against it. */
  mapSong(song: Song): Song {
    const lane = laneSong(song, [...this.byNote.values()]);
    this.realPitch = lane.realPitch;
    this.realNotes = new Map(song.notes.map((note) => [note.id, note]));
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
    // The keys held light themselves; a pitch no held key plays (a MIDI piano) lights a guess.
    const pressed = new Set<number>(this.held.filter((column) => this.byColumn.has(column)));
    for (const pitch of frame.pressed) {
      if (this.heldColumn(pitch) !== undefined) continue;
      const column = this.columnOf(pitch, frame.time, due);
      if (column !== undefined) pressed.add(column);
    }
    // Listening, the program plays every note: its keys light as they sound.
    const listening = frame.hands.size === 0;
    const sounding = new Set<number>();
    if (listening) {
      for (const pitch of frame.sounding) {
        const column = this.columnOf(pitch, frame.time, due);
        if (column !== undefined) sounding.add(column);
      }
    }
    const graded = frame.graded?.flatMap((strike) => {
      const column = this.columnOf(strike.pitch, frame.time, due);
      return column === undefined ? [] : [{ ...strike, pitch: column }];
    });
    return {
      ...frame,
      due,
      ...(frame.hintNotes ? { hintNotes: this.inLane(frame.hintNotes) } : {}),
      pressed,
      // Practising, the accompaniment sounds off the lane: no key of it lights.
      sounding: listening ? sounding : NOTHING,
      // Every note of the lane is the player's, whichever hand types it.
      hands: listening ? frame.hands : BOTH_HANDS,
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

  /** A computer key down or up, as the keyboard says: shown only, the input plays it. */
  hold(code: string, down: boolean): void {
    const column = keyColumn(code);
    if (column === undefined) return;
    this.held = this.held.filter((item) => item !== column);
    if (down) this.held.push(column);
  }

  /** Every key up: the window lost the keyboard. */
  releaseAll(): void {
    this.held = [];
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
    if (this.pressed !== undefined) {
      this.mouseColumn = column;
      this.held = [...this.held.filter((item) => item !== column), column];
    }
    return this.pressed;
  }

  /** The real pitch the last mouse press sounded, now released. */
  release(): number | undefined {
    const pitch = this.pressed;
    this.pressed = undefined;
    this.held = this.held.filter((item) => item !== this.mouseColumn);
    this.mouseColumn = undefined;
    return pitch;
  }

  private inLane(notes: readonly SongNote[]): SongNote[] {
    return notes.flatMap((note) => this.laneById.get(note.id) ?? []);
  }

  /** The latest held key that plays a real pitch. */
  private heldColumn(real: number): number | undefined {
    for (let index = this.held.length - 1; index >= 0; index--) {
      const column = this.held[index] ?? -1;
      if (this.byColumn.get(column)?.some((token) => token.pitch === real)) return column;
    }
    return undefined;
  }

  /**
   * The column a real pitch is played on now: the held key that plays it, else the owed note's,
   * else the latest begun's.
   */
  private columnOf(real: number, time: number, due: readonly SongNote[]): number | undefined {
    const held = this.heldColumn(real);
    if (held !== undefined) return held;
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
  return (computer?.look ?? PIANO_LOOK).color(note);
}

/** What a token is typed as on a falling note: its letter, Shift and Alt as ⇧ and ⌥. */
export function letterOf(token: GeneratedToken): string {
  return token.input.display
    .replace(/^Shift\+/, "⇧")
    .replace(/^Alt\+/, "⌥")
    .toUpperCase();
}
