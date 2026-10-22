import type { Hand } from "../fingering/fingering";
import type { ReadingSkillId } from "./types";

export interface ReadingProfileDefinition {
  readonly skillId: ReadingSkillId;
  readonly pitches: readonly number[];
  readonly octave: number;
  readonly clef: "G" | "F";
  readonly clefLine: number;
  readonly hand: Hand;
  readonly noteIdPrefix: string;
}

export const TREBLE_READING_PROFILE: ReadingProfileDefinition = {
  skillId: "note-reading",
  pitches: [60, 62, 64, 65, 67],
  octave: 4,
  clef: "G",
  clefLine: 2,
  hand: "right",
  noteIdPrefix: "reading-n"
};

export const BASS_READING_PROFILE: ReadingProfileDefinition = {
  skillId: "bass-note-reading",
  pitches: [48, 50, 52, 53, 55],
  octave: 3,
  clef: "F",
  clefLine: 4,
  hand: "left",
  noteIdPrefix: "bass-reading-n"
};
