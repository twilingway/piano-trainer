import { normalizeReadingSeed } from "../reading/generator";
import { createMusicExercise, MUSIC_GENERATOR_VERSION, normalizeMusicNotes } from "./material";
import { musicChoice, musicRandom } from "./random";
import type { MusicExercise, MusicNote } from "./types";

export type DictationStartMode = "known" | "relative";
export interface DictationExercise extends MusicExercise {
  readonly startMode: DictationStartMode;
  readonly level: number;
}
export interface DictationOptions {
  readonly id?: string;
  readonly seed: number;
  readonly length: number;
  readonly level?: number;
  readonly generatorVersion?: number;
  readonly bpm: number;
  readonly startMode: DictationStartMode;
  readonly studiedPitches: readonly number[];
  readonly studiedDurations: readonly number[];
}

export interface DictationMaterial {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly bpm: number;
  readonly notes: readonly MusicNote[];
  readonly length: number;
  readonly level: number;
  readonly startMode: DictationStartMode;
}

/** Cheap candidate generation for novelty search: no score construction or XML parsing. */
export function generateDictationMaterial(options: DictationOptions): DictationMaterial {
  if (!Number.isInteger(options.length) || options.length < 2 || options.length > 8)
    throw new RangeError("Dictation length must be between 2 and 8 notes");
  const level = options.level ?? 1;
  if (!Number.isInteger(level) || level < 1)
    throw new RangeError("Dictation level must be a positive integer");
  if (!["known", "relative"].includes(options.startMode))
    throw new RangeError("Invalid dictation start mode");
  if (
    !options.studiedPitches.length ||
    options.studiedPitches.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)
  )
    throw new RangeError("Dictation requires studied MIDI pitches");
  if (
    !options.studiedDurations.length ||
    options.studiedDurations.some(
      (duration) =>
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 8 ||
        !Number.isInteger(duration * 4)
    )
  )
    throw new RangeError("Dictation requires studied rhythms on the sixteenth grid");
  if ((options.generatorVersion ?? MUSIC_GENERATOR_VERSION) !== MUSIC_GENERATOR_VERSION)
    throw new RangeError("Unsupported music generator version");
  if (!Number.isFinite(options.bpm) || options.bpm < 30 || options.bpm > 240)
    throw new RangeError("Music tempo must be between 30 and 240 BPM");
  const seed = normalizeReadingSeed(options.seed);
  const random = musicRandom(seed);
  const notes: MusicNote[] = [];
  let startBeat = 0;
  while (notes.length < options.length) {
    const pitch = musicChoice(options.studiedPitches, random);
    const durationBeats = musicChoice(options.studiedDurations, random);
    notes.push({ pitch, startBeat, durationBeats, hand: "right" });
    startBeat += durationBeats;
  }
  return {
    id:
      options.id ?? `dictation-${String(options.seed)}-${String(level)}-${String(options.length)}`,
    seed,
    bpm: options.bpm,
    generatorVersion: MUSIC_GENERATOR_VERSION,
    notes: normalizeMusicNotes(notes),
    length: options.length,
    level,
    startMode: options.startMode
  };
}

/** Construct only the chosen material through the existing score and song pipeline. */
export function generateDictation(options: DictationOptions): DictationExercise {
  const material = generateDictationMaterial(options);
  return { ...createMusicExercise(material), level: material.level, startMode: material.startMode };
}

export interface DictationReplyNote {
  readonly pitch: number;
  /** Caller-supplied PracticeSession beat, without any local clock integration. */
  readonly startBeat: number;
  readonly durationBeats: number;
}
export interface DictationTimingMetric {
  readonly errorsBeats: readonly number[];
  readonly meanAbsoluteErrorBeats: number | null;
  readonly accuracy: number | null;
}
export interface DictationComparison {
  readonly status: "performed" | "not-performed";
  readonly transposition: number | null;
  readonly positionalPitchAccuracy: number | null;
  readonly pitchMismatchIndices: readonly number[];
  readonly pitchContentAccuracy: number | null;
  readonly orderAccuracy: number | null;
  readonly orderCorrect: boolean | null;
  readonly missingNotes: number;
  readonly extraNotes: number;
  readonly alignedOnsets: DictationTimingMetric;
  readonly onsetIntervals: DictationTimingMetric;
  readonly holdingDurations: DictationTimingMetric;
  readonly correct: boolean | null;
}

function timingMetric(errors: readonly number[], tolerance: number): DictationTimingMetric {
  return {
    errorsBeats: errors,
    meanAbsoluteErrorBeats: errors.length
      ? errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length
      : null,
    accuracy: errors.length
      ? errors.filter((error) => Math.abs(error) <= tolerance).length / errors.length
      : null
  };
}

function commonSubsequence(left: readonly number[], right: readonly number[]): number {
  const row = Array<number>(right.length + 1).fill(0);
  for (const pitch of left) {
    let diagonal = 0;
    for (let index = 0; index < right.length; index++) {
      const previous = row[index + 1] ?? 0;
      row[index + 1] = pitch === right[index] ? diagonal + 1 : Math.max(previous, row[index] ?? 0);
      diagonal = previous;
    }
  }
  return row[right.length] ?? 0;
}

/** Index-based pitch/timing metrics deliberately retain incorrect attacks and extra notes. */
export function compareDictation(
  exercise: DictationExercise,
  reply: readonly DictationReplyNote[],
  toleranceBeats = 0.125
): DictationComparison {
  if (!Number.isFinite(toleranceBeats) || toleranceBeats < 0)
    throw new RangeError("Invalid dictation timing tolerance");
  if (
    reply.some(
      (note, index) =>
        !Number.isInteger(note.pitch) ||
        note.pitch < 0 ||
        note.pitch > 127 ||
        !Number.isFinite(note.startBeat) ||
        !Number.isFinite(note.durationBeats) ||
        note.durationBeats < 0 ||
        (index > 0 && note.startBeat < (reply[index - 1]?.startBeat ?? 0))
    )
  )
    throw new RangeError("Invalid dictation reply");
  const firstExpected = exercise.notes[0];
  const firstReply = reply[0];
  if (!firstExpected) throw new RangeError("Dictation reference cannot be empty");
  const performed = firstReply !== undefined;
  const transposition = performed
    ? exercise.startMode === "relative"
      ? firstReply.pitch - firstExpected.pitch
      : 0
    : null;
  const expected = exercise.notes.map((note) => note.pitch);
  const actual = reply.map((note) => note.pitch - (transposition ?? 0));
  const denominator = Math.max(expected.length, actual.length);
  const mismatches: number[] = [];
  const counts = new Map<number, number>();
  for (const pitch of expected) counts.set(pitch, (counts.get(pitch) ?? 0) + 1);
  let contentMatches = 0;
  for (const pitch of actual) {
    const count = counts.get(pitch) ?? 0;
    if (count > 0) {
      contentMatches++;
      counts.set(pitch, count - 1);
    }
  }
  let positionalMatches = 0;
  const onsets: number[] = [];
  const intervals: number[] = [];
  const durations: number[] = [];
  for (let index = 0; index < denominator; index++) {
    const target = exercise.notes[index];
    const note = reply[index];
    if (target && note && target.pitch === actual[index]) positionalMatches++;
    else if (target && note) mismatches.push(index);
    if (!target || !note || !firstReply) continue;
    onsets.push(
      note.startBeat - firstReply.startBeat - (target.startBeat - firstExpected.startBeat)
    );
    durations.push(note.durationBeats - target.durationBeats);
    const previousTarget = exercise.notes[index - 1];
    const previousNote = reply[index - 1];
    if (previousTarget && previousNote)
      intervals.push(
        note.startBeat - previousNote.startBeat - (target.startBeat - previousTarget.startBeat)
      );
  }
  const missingNotes = Math.max(0, expected.length - actual.length);
  const extraNotes = Math.max(0, actual.length - expected.length);
  const orderCorrect = performed ? positionalMatches === denominator : null;
  const alignedOnsets = timingMetric(onsets, toleranceBeats);
  const onsetIntervals = timingMetric(intervals, toleranceBeats);
  const holdingDurations = timingMetric(durations, toleranceBeats);
  return {
    status: performed ? "performed" : "not-performed",
    transposition,
    positionalPitchAccuracy: performed ? positionalMatches / denominator : null,
    pitchMismatchIndices: mismatches,
    pitchContentAccuracy: performed ? contentMatches / denominator : null,
    orderAccuracy: performed ? commonSubsequence(expected, actual) / denominator : null,
    orderCorrect,
    missingNotes,
    extraNotes,
    alignedOnsets,
    onsetIntervals,
    holdingDurations,
    correct: performed
      ? orderCorrect === true &&
        alignedOnsets.accuracy === 1 &&
        onsetIntervals.accuracy === 1 &&
        holdingDurations.accuracy === 1 &&
        !missingNotes &&
        !extraNotes
      : null
  };
}
