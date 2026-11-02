import { normalizeReadingSeed } from "../reading/generator";
import { songFromMusicXml } from "../song/musicxml";
import { withFingering } from "../song/song";
import { DIVISIONS, measuresUntil, writeScore } from "../song/scoreWriter";
import type { MusicExercise, MusicNote } from "./types";

export const MUSIC_GENERATOR_VERSION = 1;
export const MUSIC_MATERIAL_LIMIT = 128;
export const MUSIC_BEAT_LIMIT = 64;

function ticks(beats: number): number {
  const value = beats * DIVISIONS;
  if (!Number.isFinite(value) || !Number.isInteger(value))
    throw new RangeError("Music timing must use the sixteenth-note grid");
  return value;
}

/** Reject material the one-voice-per-hand writer would silently change. */
export function normalizeMusicNotes(notes: readonly MusicNote[]): readonly MusicNote[] {
  if (notes.length === 0 || notes.length > MUSIC_MATERIAL_LIMIT)
    throw new RangeError("Music material must contain 1-128 notes");
  const sorted = notes
    .map((note) => {
      if (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127)
        throw new RangeError("Music pitch must be a MIDI note");
      if (!["left", "right"].includes(note.hand)) throw new RangeError("Music hand is invalid");
      const start = ticks(note.startBeat);
      const duration = ticks(note.durationBeats);
      if (start < 0 || duration <= 0 || start + duration > MUSIC_BEAT_LIMIT * DIVISIONS)
        throw new RangeError("Music timing is outside the supported phrase range");
      return { ...note };
    })
    .sort(
      (a, b) =>
        a.startBeat - b.startBeat ||
        (a.hand === b.hand ? 0 : a.hand === "left" ? -1 : 1) ||
        a.pitch - b.pitch
    );
  for (const hand of ["left", "right"] as const) {
    let previous: MusicNote | undefined;
    for (const note of sorted.filter((value) => value.hand === hand)) {
      if (previous) {
        const sameOnset = previous.startBeat === note.startBeat;
        if (
          sameOnset &&
          (previous.pitch === note.pitch || previous.durationBeats !== note.durationBeats)
        )
          throw new RangeError("Music chord notes must be unique and share their duration");
        if (!sameOnset && previous.startBeat + previous.durationBeats > note.startBeat)
          throw new RangeError("Music voices cannot overlap within one hand");
      }
      previous = note;
    }
  }
  return sorted;
}

/** Exact canonical text avoids probabilistic hash collisions in the novelty journal. */
export function musicFingerprint(notes: readonly MusicNote[]): string {
  return (
    "music-v1:" +
    JSON.stringify(
      normalizeMusicNotes(notes).map((note) => [
        note.pitch,
        ticks(note.startBeat),
        ticks(note.durationBeats),
        note.hand === "right" ? 1 : 2
      ])
    )
  );
}

export interface MusicExerciseOptions {
  readonly id: string;
  readonly seed: number;
  readonly bpm: number;
  readonly notes: readonly MusicNote[];
  /** Already localized by the calling shell, or empty for an unnamed exercise. */
  readonly title?: string;
  readonly fifths?: number;
  readonly generatorVersion?: number;
}

export function createMusicExercise(options: MusicExerciseOptions): MusicExercise {
  if (
    options.generatorVersion !== undefined &&
    options.generatorVersion !== MUSIC_GENERATOR_VERSION
  )
    throw new RangeError("Unsupported music generator version");
  if (!Number.isFinite(options.bpm) || options.bpm < 30 || options.bpm > 240)
    throw new RangeError("Music tempo must be between 30 and 240 BPM");
  const fifths = options.fifths ?? 0;
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7)
    throw new RangeError("Music key signature is invalid");
  const notes = normalizeMusicNotes(options.notes);
  const end = Math.max(...notes.map((note) => ticks(note.startBeat + note.durationBeats)));
  const written = writeScore(
    notes.map((note) => ({
      pitch: note.pitch,
      start: ticks(note.startBeat),
      end: ticks(note.startBeat + note.durationBeats),
      staff: note.hand === "right" ? 1 : 2
    })),
    { title: options.title ?? "", measures: measuresUntil([], end), fifths }
  );
  const direction = `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${String(options.bpm)}</per-minute></metronome></direction-type><sound tempo="${String(options.bpm)}"/></direction>`;
  const musicXml = written.musicXml.replace("</attributes>", `</attributes>${direction}`);
  return {
    id: options.id,
    seed: normalizeReadingSeed(options.seed),
    generatorVersion: MUSIC_GENERATOR_VERSION,
    bpm: options.bpm,
    notes,
    fingerprint: musicFingerprint(notes),
    musicXml,
    song: withFingering(songFromMusicXml(musicXml, options.title ?? ""))
  };
}
