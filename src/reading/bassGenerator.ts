import { songFromMusicXml } from "../song/musicxml";
import {
  normalizeReadingSeed,
  readingMusicXmlForPitches,
  readingPitchesForSeed
} from "./generator";
import { BASS_READING_PROFILE } from "./profiles";
import type { BassReadingTask } from "./bassTypes";
import type { ReadingExercise } from "./types";

export const BASS_READING_GENERATOR_VERSION = 1;
export const BASS_READING_PITCHES = [48, 50, 52, 53, 55] as const;

export function bassReadingSequenceForSeed(seed: number, version = 1): readonly number[] {
  if (version !== BASS_READING_GENERATOR_VERSION)
    throw new RangeError("Unsupported bass reading generator version");
  return readingPitchesForSeed(seed, undefined, BASS_READING_PROFILE);
}

/** New series change the pitches; task stays part of the exercise identity. */
export function nextBassReadingSeed(seed: number, task: BassReadingTask): number {
  if (!["notes", "phrases"].includes(task)) throw new RangeError("Invalid bass reading task");
  const previous = bassReadingSequenceForSeed(seed);
  let next = normalizeReadingSeed(seed);
  do {
    next = (next + 1) >>> 0;
  } while (bassReadingSequenceForSeed(next).every((pitch, index) => pitch === previous[index]));
  return next;
}

/** One full source score, parsed once; the session and prompts consume that score. */
export function generateBassReadingExercise(
  task: BassReadingTask,
  seed: number,
  version = 1
): ReadingExercise {
  if (!["notes", "phrases"].includes(task)) throw new RangeError("Invalid bass reading task");
  const normalized = normalizeReadingSeed(seed);
  const musicXml = readingMusicXmlForPitches(
    bassReadingSequenceForSeed(normalized, version),
    BASS_READING_PROFILE
  );
  return {
    skillId: BASS_READING_PROFILE.skillId,
    id: `bass-reading-v1-${task}-${String(normalized)}`,
    task,
    seed: normalized,
    generatorVersion: BASS_READING_GENERATOR_VERSION,
    musicXml,
    song: songFromMusicXml(musicXml, "")
  };
}
