import { assignFingering } from "../fingering/fingering";
import type { Finger, Hand, TransitionKind } from "../fingering/fingering";
import type { SongPart } from "./midiParts";

export interface SongNote {
  readonly id: string;
  /** MIDI note number, 60 = middle C. */
  readonly pitch: number;
  /** Seconds from the start of the song at its written tempo. */
  readonly start: number;
  readonly duration: number;
  /** Quarter notes from the start; what the staff cursor is synchronised by. */
  readonly startBeat: number;
  readonly hand: Hand;
  /** The id of the song's part the note belongs to, when the song has parts. */
  readonly part?: string;
  /** Position of the note's <note> element among all of them, for MusicXML sources. */
  readonly sourceIndex?: number;
  /** A finger written in the score; it pins the solver. */
  readonly scoreFinger?: Finger;
  readonly finger?: Finger;
  readonly transition?: TransitionKind;
  /** How hard the note is struck, MIDI 1-127; a recorded take has it, a score does not. */
  readonly velocity?: number;
}

export interface SongBeat {
  /** Seconds from the start of the song at its written tempo. */
  readonly time: number;
  /** Quarter notes from the start: where the beat sits in the score. */
  readonly position: number;
  /** The first beat of a measure: the metronome's "tick" rather than its "tock". */
  readonly downbeat: boolean;
}

/** A measure of the score, in quarter notes: what a transcription is laid out in. */
export interface SongMeasure {
  readonly start: number;
  readonly length: number;
  /** Time signature: beats per measure and the note value of one beat. */
  readonly beats: number;
  readonly beatType: number;
}

export interface Song {
  readonly title: string;
  readonly source: "midi" | "musicxml";
  readonly notes: readonly SongNote[];
  /** The metronome grid, in order. */
  readonly beats: readonly SongBeat[];
  /** The measures, in order; the first may be a short pickup. */
  readonly measures: readonly SongMeasure[];
  /** Seconds until the last note ends. */
  readonly duration: number;
  /** The original MusicXML text, for the staff renderer; absent for MIDI. */
  readonly musicXml?: string;
  /** A MIDI arrangement's parts, one per melodic track; absent with a single track or a score. */
  readonly parts?: readonly SongPart[];
  /** The simpler version of a MIDI arrangement rather than the file as it is. */
  readonly simplified?: boolean;
  /** A MIDI song's notes as its written score has them rather than as the file plays them. */
  readonly asWritten?: boolean;
}

/** Middle C and above go to the right hand when nothing better tells the hands apart. */
export const HAND_SPLIT_PITCH = 60;

export function handByPitch(pitch: number): Hand {
  return pitch >= HAND_SPLIT_PITCH ? "right" : "left";
}

export function sortNotes<T extends { start: number; pitch: number }>(notes: T[]): T[] {
  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/**
 * Fingers every note: the score's own fingering is kept, the solver fills the
 * rest. `overrides` are the player's corrections and win over both.
 */
export function withFingering(song: Song, overrides?: ReadonlyMap<string, Finger>): Song {
  const fingered = new Map<string, { finger: Finger; transition?: TransitionKind }>();
  for (const hand of ["right", "left"] as const) {
    const notes = song.notes.filter((note) => note.hand === hand);
    const fixed = new Map<string, Finger>();
    for (const note of notes) {
      const pinned = overrides?.get(note.id) ?? note.scoreFinger;
      if (pinned !== undefined) fixed.set(note.id, pinned);
    }
    for (const [id, result] of assignFingering(notes, hand, fixed)) fingered.set(id, result);
  }
  return {
    ...song,
    notes: song.notes.map((note) => {
      const result = fingered.get(note.id);
      if (!result) return note;
      const { finger, transition, ...rest } = note;
      return result.transition === undefined
        ? { ...rest, finger: result.finger }
        : { ...rest, finger: result.finger, transition: result.transition };
    })
  };
}

/** Quarters a second where a song has no beat grid to read: 120 per quarter. */
const DEFAULT_QUARTERS_PER_SECOND = 2;

/** Quarter notes at a song time, read off the song's beat grid; beyond it, at its edge tempo. */
export function quartersAt(song: Song, time: number): number {
  const beats = song.beats;
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) return time * DEFAULT_QUARTERS_PER_SECOND;
  const rate = (a: typeof first, b: typeof first) =>
    b.time > a.time ? (b.position - a.position) / (b.time - a.time) : DEFAULT_QUARTERS_PER_SECOND;
  if (time <= first.time) return first.position + (time - first.time) * rate(first, second);
  for (let index = 1; index < beats.length; index++) {
    const after = beats[index];
    const before = beats[index - 1];
    if (!after || !before) break;
    if (time <= after.time) return before.position + (time - before.time) * rate(before, after);
  }
  const last = beats.at(-1) ?? second;
  const beforeLast = beats.at(-2) ?? first;
  return last.position + (time - last.time) * rate(beforeLast, last);
}

/** Song time at a number of quarter notes: the inverse of `quartersAt`. */
export function secondsAt(song: Song, quarters: number): number {
  const beats = song.beats;
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) return quarters / DEFAULT_QUARTERS_PER_SECOND;
  const rate = (a: typeof first, b: typeof first) =>
    b.position > a.position
      ? (b.time - a.time) / (b.position - a.position)
      : 1 / DEFAULT_QUARTERS_PER_SECOND;
  if (quarters <= first.position)
    return first.time + (quarters - first.position) * rate(first, second);
  for (let index = 1; index < beats.length; index++) {
    const after = beats[index];
    const before = beats[index - 1];
    if (!after || !before) break;
    if (quarters <= after.position)
      return before.time + (quarters - before.position) * rate(before, after);
  }
  const last = beats.at(-1) ?? second;
  const beforeLast = beats.at(-2) ?? first;
  return last.time + (quarters - last.position) * rate(beforeLast, last);
}
