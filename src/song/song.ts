import { assignFingering } from "../fingering/fingering";
import type { Finger, Hand, TransitionKind } from "../fingering/fingering";

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
  /** A finger written in the score; it pins the solver. */
  readonly scoreFinger?: Finger;
  readonly finger?: Finger;
  readonly transition?: TransitionKind;
}

export interface SongBeat {
  /** Seconds from the start of the song at its written tempo. */
  readonly time: number;
  /** The first beat of a measure: the metronome's "tick" rather than its "tock". */
  readonly downbeat: boolean;
}

export interface Song {
  readonly title: string;
  readonly source: "midi" | "musicxml";
  readonly notes: readonly SongNote[];
  /** The metronome grid, in order. */
  readonly beats: readonly SongBeat[];
  /** Seconds until the last note ends. */
  readonly duration: number;
  /** The original MusicXML text, for the staff renderer; absent for MIDI. */
  readonly musicXml?: string;
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
