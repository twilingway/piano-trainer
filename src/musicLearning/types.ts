import type { Hand } from "../fingering/fingering";
import type { Song } from "../song/song";

/** Quarter-note units on the existing score writer's sixteenth grid. */
export interface MusicNote {
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly hand: Hand;
}

export type MusicCourse = "sight-reading" | "harmony" | "dictation" | "integrated";
export type MusicPurpose = "training" | "control";

/** The score is authored once; all views and evaluation use the parsed song. */
export interface MusicExercise {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly bpm: number;
  readonly notes: readonly MusicNote[];
  readonly fingerprint: string;
  readonly musicXml: string;
  readonly song: Song;
}

export interface MusicHelpEvent {
  readonly atMs: number;
  readonly kind: "note-name" | "key-light" | "position" | "fingering" | "explanation" | "replay";
}
