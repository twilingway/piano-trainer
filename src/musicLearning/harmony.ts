import { createMusicExercise } from "./material";
import { musicChoice, musicRandom } from "./random";
import type { MusicExercise, MusicNote } from "./types";

export type TriadQuality = "major" | "minor";
export type TriadInversion = 0 | 1 | 2;
export type TriadPitches = readonly [number, number, number];
export interface HarmonyTriad {
  readonly root: number;
  readonly quality: TriadQuality;
  readonly inversion: TriadInversion;
  readonly pitches: TriadPitches;
}
export type HarmonyTarget =
  | { readonly mode: "exact"; readonly pitches: readonly number[] }
  | {
      readonly mode: "pitch-class";
      readonly pitches: readonly number[];
      /** Omit for class recognition; present for inversion recognition. */
      readonly bassPitchClass?: number;
      /** Class recognition may permit doublings; a physical triad exercise can explicitly forbid them. */
      readonly allowOctaveDoubling?: boolean;
    };
export type HarmonyMismatch =
  | "invalid-input"
  | "extra-note"
  | "octave-duplicate"
  | "missing-note"
  | "wrong-position"
  | "wrong-bass";
export interface HarmonyComparison {
  readonly correct: boolean;
  readonly reason: HarmonyMismatch | null;
  readonly missing: readonly number[];
  readonly extra: readonly number[];
  readonly bass: number | null;
}
const midi = (pitch: number): boolean => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127;
const pc = (pitch: number): number => pitch % 12;
const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);
const sortedClasses = (pitches: readonly number[]): number[] =>
  [...new Set(pitches.map(pc))].sort((a, b) => a - b);

export function buildTriad(
  root: number,
  quality: TriadQuality,
  inversion: TriadInversion = 0
): HarmonyTriad {
  if (!midi(root) || !["major", "minor"].includes(quality) || ![0, 1, 2].includes(inversion))
    throw new RangeError("Invalid triad root, quality or inversion");
  const pitches = [root, root + (quality === "major" ? 4 : 3), root + 7];
  for (let index = 0; index < inversion; index++) pitches.push((pitches.shift() ?? root) + 12);
  if (!pitches.every(midi)) throw new RangeError("Triad exceeds MIDI range");
  return { root, quality, inversion, pitches: pitches as unknown as TriadPitches };
}

/** Invalid targets are programming errors; malformed player answers are ordinary feedback. */
export function validateHarmonyTarget(target: HarmonyTarget): void {
  if (
    !["exact", "pitch-class"].includes(target.mode) ||
    target.pitches.length !== 3 ||
    !target.pitches.every(midi) ||
    sortedClasses(target.pitches).length !== 3 ||
    (target.mode === "pitch-class" &&
      target.allowOctaveDoubling !== undefined &&
      typeof target.allowOctaveDoubling !== "boolean") ||
    (target.mode === "pitch-class" &&
      target.bassPitchClass !== undefined &&
      (!Number.isInteger(target.bassPitchClass) ||
        target.bassPitchClass < 0 ||
        target.bassPitchClass > 11 ||
        !sortedClasses(target.pitches).includes(target.bassPitchClass)))
  )
    throw new RangeError("Harmony target requires three distinct pitch classes and a valid bass");
}

export function compareHarmonyChord(
  target: HarmonyTarget,
  played: readonly number[]
): HarmonyComparison {
  validateHarmonyTarget(target);
  const invalid =
    played.length > 128 || !played.every(midi) || new Set(played).size !== played.length;
  const ordered = played.toSorted((a, b) => a - b);
  const bass = ordered[0] ?? null;
  const expectedClasses = sortedClasses(target.pitches);
  const actualClasses = sortedClasses(played);
  const extra = played.filter((pitch) => !expectedClasses.includes(pc(pitch)));
  const missing = target.pitches.filter((pitch) => !actualClasses.includes(pc(pitch)));
  const duplicatesAllowed =
    target.mode === "pitch-class" &&
    target.bassPitchClass === undefined &&
    target.allowOctaveDoubling !== false;
  let reason: HarmonyMismatch | null = null;
  if (invalid) reason = "invalid-input";
  else if (extra.length) reason = "extra-note";
  else if (!duplicatesAllowed && actualClasses.length !== played.length)
    reason = "octave-duplicate";
  else if (missing.length) reason = "missing-note";
  else if (
    target.mode === "exact" &&
    !same(
      ordered,
      target.pitches.toSorted((a, b) => a - b)
    )
  )
    reason = "wrong-position";
  else if (
    target.mode === "pitch-class" &&
    target.bassPitchClass !== undefined &&
    bass !== null &&
    pc(bass) !== target.bassPitchClass
  )
    reason = "wrong-bass";
  return { correct: reason === null, reason, missing, extra, bass };
}

export type HarmonyDegree = "I" | "IV" | "V" | "vi";
export type HarmonyFunction = "tonic" | "subdominant" | "dominant" | "submediant";
const DEGREES: Record<
  HarmonyDegree,
  { offset: number; quality: TriadQuality; function: HarmonyFunction }
> = {
  I: { offset: 0, quality: "major", function: "tonic" },
  IV: { offset: 5, quality: "major", function: "subdominant" },
  V: { offset: 7, quality: "major", function: "dominant" },
  vi: { offset: 9, quality: "minor", function: "submediant" }
};
export const HARMONY_PROGRESSIONS = {
  "I-IV-V-I": ["I", "IV", "V", "I"],
  "I-V-vi-IV": ["I", "V", "vi", "IV"]
} as const satisfies Record<string, readonly HarmonyDegree[]>;
export type HarmonyProgression = keyof typeof HARMONY_PROGRESSIONS;
export interface HarmonyFunctionChord extends HarmonyTriad {
  readonly degree: HarmonyDegree;
  readonly function: HarmonyFunction;
}
export function harmonyFunctionChord(
  degree: HarmonyDegree,
  tonic = 60,
  inversion: TriadInversion = 0
): HarmonyFunctionChord {
  if (!Object.hasOwn(DEGREES, degree) || !midi(tonic))
    throw new RangeError("Unknown harmonic degree or tonic");
  const entry = DEGREES[degree];
  return {
    ...buildTriad(tonic + entry.offset, entry.quality, inversion),
    degree,
    function: entry.function
  };
}
export function harmonyProgression(
  progression: HarmonyProgression,
  tonic = 60
): readonly HarmonyFunctionChord[] {
  if (!Object.hasOwn(HARMONY_PROGRESSIONS, progression))
    throw new RangeError("Unknown harmonic progression");
  const degrees = HARMONY_PROGRESSIONS[progression];
  return degrees.map((degree) => harmonyFunctionChord(degree, tonic));
}

export interface HarmonyVoiceRange {
  readonly low: number;
  readonly high: number;
  /** The bounded close-position candidates never exceed one octave. */
  readonly maxSpan?: number;
}
export interface HarmonyVoicing {
  readonly pitches: TriadPitches;
  readonly inversion: TriadInversion;
  readonly motion: number;
  readonly commonPitches: readonly number[];
}
function validVoices(pitches: readonly number[]): boolean {
  return (
    pitches.length === 3 &&
    pitches.every(midi) &&
    pitches.every((pitch, index) => index === 0 || pitch > (pitches[index - 1] ?? pitch))
  );
}
/** At most 32 close-position candidates: three ascending voices, never crossed or stretched. */
export function harmonyVoicingCandidates(
  previous: TriadPitches,
  chord: Pick<HarmonyTriad, "root" | "quality">,
  range: HarmonyVoiceRange
): readonly HarmonyVoicing[] {
  const span = range.maxSpan ?? 12;
  if (
    !validVoices(previous) ||
    !midi(range.low) ||
    !midi(range.high) ||
    range.low > range.high ||
    !Number.isInteger(span) ||
    span < 1 ||
    span > 12
  )
    throw new RangeError("Invalid voice ordering or range");
  buildTriad(chord.root, chord.quality);
  const results: HarmonyVoicing[] = [];
  for (let root = pc(chord.root); root <= 120; root += 12) {
    for (const inversion of [0, 1, 2] as const) {
      const highest =
        inversion === 2
          ? root + (chord.quality === "major" ? 16 : 15)
          : root + (inversion ? 12 : 7);
      if (highest > 127) continue;
      const { pitches } = buildTriad(root, chord.quality, inversion);
      if (pitches[0] < range.low || pitches[2] > range.high || pitches[2] - pitches[0] > span)
        continue;
      results.push({
        pitches,
        inversion,
        motion: pitches.reduce(
          (sum, pitch, index) => sum + Math.abs(pitch - (previous[index] ?? pitch)),
          0
        ),
        commonPitches: pitches.filter((pitch) => previous.includes(pitch))
      });
    }
  }
  return results.sort(
    (a, b) =>
      a.motion - b.motion ||
      b.commonPitches.length - a.commonPitches.length ||
      a.pitches[0] - b.pitches[0]
  );
}
export function smoothHarmonyVoicing(
  previous: TriadPitches,
  chord: Pick<HarmonyTriad, "root" | "quality">,
  range: HarmonyVoiceRange
): HarmonyVoicing | null {
  return harmonyVoicingCandidates(previous, chord, range)[0] ?? null;
}
export function compareHarmonyTransition(
  previous: TriadPitches,
  chord: Pick<HarmonyTriad, "root" | "quality">,
  played: readonly number[],
  range: HarmonyVoiceRange
): {
  readonly chord: HarmonyComparison;
  readonly admissible: boolean;
  readonly motion: number | null;
  readonly minimumMotion: number | null;
  readonly optimal: boolean;
  readonly commonPitches: readonly number[];
} {
  const comparison = compareHarmonyChord(
    { mode: "pitch-class", pitches: buildTriad(chord.root, chord.quality).pitches },
    played
  );
  const candidates = harmonyVoicingCandidates(previous, chord, range);
  const ordered = played.toSorted((a, b) => a - b);
  const admitted = candidates.find((candidate) => same(candidate.pitches, ordered));
  const minimumMotion = candidates[0]?.motion ?? null;
  return {
    chord: comparison,
    admissible: admitted !== undefined,
    motion: admitted?.motion ?? null,
    minimumMotion,
    optimal: !!admitted && admitted.motion === minimumMotion,
    commonPitches: admitted?.commonPitches ?? []
  };
}

export interface HarmonyExerciseOptions {
  readonly id: string;
  readonly seed: number;
  readonly bpm: number;
  readonly title?: string;
  readonly fifths?: number;
}
const KEY_FIFTHS: Record<TriadQuality, readonly number[]> = {
  major: [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5],
  minor: [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2]
};
/** The same spelling context for a triad, its progression and a transposed melody. */
export function harmonyKeyFifths(root: number, quality: TriadQuality): number {
  if (!midi(root) || !["major", "minor"].includes(quality))
    throw new RangeError("Invalid harmony key");
  return KEY_FIFTHS[quality][pc(root)] ?? 0;
}
export interface HarmonyTriadExerciseOptions extends HarmonyExerciseOptions {
  readonly root: number;
  readonly quality: TriadQuality;
  readonly inversion?: TriadInversion;
}
export function createHarmonyTriadExercise(options: HarmonyTriadExerciseOptions): {
  readonly chord: HarmonyTriad;
  readonly exercise: MusicExercise;
} {
  const chord = buildTriad(options.root, options.quality, options.inversion);
  return {
    chord,
    exercise: createMusicExercise({
      ...options,
      fifths: options.fifths ?? harmonyKeyFifths(chord.root, chord.quality),
      notes: chord.pitches.map((pitch) => ({
        pitch,
        startBeat: 0,
        durationBeats: 4,
        hand: "right"
      }))
    })
  };
}
/** Seed selects real pitches, quality and inversion; labels do not substitute for material. */
export function generateHarmonyTriad(options: HarmonyExerciseOptions): {
  readonly chord: HarmonyTriad;
  readonly exercise: MusicExercise;
} {
  const random = musicRandom(options.seed);
  const chord = buildTriad(
    musicChoice([48, 50, 52, 53, 55, 57, 59, 60, 61, 63, 66], random),
    musicChoice(["major", "minor"] as const, random),
    musicChoice([0, 1, 2] as const, random)
  );
  return createHarmonyTriadExercise({ ...options, ...chord });
}

export interface HarmonyAccompanimentOptions extends HarmonyExerciseOptions {
  readonly progression: HarmonyProgression;
  readonly tonic?: number;
  readonly chordBeats?: number;
  readonly melody: readonly MusicNote[];
  readonly range?: HarmonyVoiceRange;
}
/** Both hands share beat coordinates and become one existing PracticeSession song. */
export function createHarmonyAccompaniment(options: HarmonyAccompanimentOptions): {
  readonly chords: readonly HarmonyTriad[];
  readonly exercise: MusicExercise;
} {
  const beats = options.chordBeats ?? 4;
  if (
    !Number.isFinite(beats) ||
    beats <= 0 ||
    !Number.isInteger(beats * 4) ||
    beats * 4 > 64 ||
    options.melody.length === 0 ||
    options.melody.some(
      (note) => note.hand !== "right" || note.startBeat + note.durationBeats > beats * 4
    )
  )
    throw new RangeError(
      "Accompaniment requires a right-hand melody within four grid-aligned chords"
    );
  const range = options.range ?? { low: 36, high: 60 };
  const progression = harmonyProgression(options.progression, options.tonic ?? 48);
  const chords: HarmonyTriad[] = [];
  for (const chord of progression) {
    const previous = chords.at(-1)?.pitches ?? buildTriad(options.tonic ?? 48, "major").pitches;
    const voicing = smoothHarmonyVoicing(previous, chord, range);
    if (!voicing) throw new RangeError("No playable accompaniment voicing in the requested range");
    chords.push({ ...chord, pitches: voicing.pitches, inversion: voicing.inversion });
  }
  const accompaniment: MusicNote[] = chords.flatMap((chord, index) =>
    chord.pitches.map((pitch) => ({
      pitch,
      startBeat: index * beats,
      durationBeats: beats,
      hand: "left"
    }))
  );
  return {
    chords,
    exercise: createMusicExercise({
      ...options,
      fifths: options.fifths ?? harmonyKeyFifths(options.tonic ?? 48, "major"),
      notes: [...options.melody, ...accompaniment]
    })
  };
}
