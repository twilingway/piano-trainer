import type { Hand } from "../fingering/fingering";
import { normalizeReadingSeed } from "../reading/generator";
import { READING_PITCHES } from "../reading/generator";
import { createMusicExercise } from "./material";
import { musicChoice, musicRandom } from "./random";
import type { MusicExercise, MusicNote, MusicPurpose } from "./types";

export type SightReadingLevel = "notes" | "steps" | "triads" | "two-hands";
export type SightGroupKind = "repeated" | "scalar" | "triadic" | "mixed";

export interface SightReadingOptions {
  readonly seed: number;
  readonly level: SightReadingLevel;
  readonly purpose: MusicPurpose;
  /** Written interval numbers, not semitone distances: repeat=1, step=2, third=3. */
  readonly learnedIntervals?: readonly number[];
  readonly bpm?: number;
}

export interface SightReadingGroup {
  readonly index: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly kind: SightGroupKind;
  readonly pitches: readonly number[];
}

export interface SightReadingExercise extends MusicExercise {
  readonly level: SightReadingLevel;
  readonly purpose: MusicPurpose;
  readonly learnedIntervals: readonly number[];
  readonly groups: readonly SightReadingGroup[];
}

/** Unparsed plan: candidate searches do not construct thousands of DOM/OSMD scores. */
export interface SightReadingMaterial {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: number;
  readonly bpm: number;
  readonly notes: readonly MusicNote[];
  readonly level: SightReadingLevel;
  readonly purpose: MusicPurpose;
  readonly learnedIntervals: readonly number[];
  readonly groups: readonly SightReadingGroup[];
}

const QUARTERS = [1, 1, 1, 1] as const;
const RHYTHMS: readonly (readonly number[])[] = [
  QUARTERS,
  [1, 0.5, 0.5, 2],
  [0.5, 0.5, 1, 2],
  [2, 1, 0.5, 0.5]
];
const WHITE_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;
const WHITE_PITCHES = Array.from({ length: 128 }, (_, pitch) => pitch).filter((pitch) =>
  (WHITE_CLASSES as readonly number[]).includes(pitch % 12)
);

export function classifySightGroup(pitches: readonly number[]): SightGroupKind {
  if (pitches.length < 2) return "mixed";
  const positions = pitches.map((pitch) => WHITE_PITCHES.indexOf(pitch));
  if (positions.some((position) => position < 0)) return "mixed";
  const unique = [...new Set(positions)].sort((a, b) => a - b);
  if (unique.length === 1) return "repeated";
  const moves = positions
    .slice(1)
    .map((position, index) => position - (positions[index] ?? position));
  if (moves.every((move) => move === 1) || moves.every((move) => move === -1)) return "scalar";
  const [first, second, third] = unique;
  if (
    unique.length === 3 &&
    first !== undefined &&
    second !== undefined &&
    third !== undefined &&
    second - first === 2 &&
    third - second === 2
  )
    return "triadic";
  return "mixed";
}

function intervalAllowed(from: number, to: number, learned: readonly number[]): boolean {
  return learned.includes(Math.abs(from - to) + 1);
}

function groupPositions(
  level: SightReadingLevel,
  previous: number | undefined,
  learned: readonly number[],
  random: () => number
): readonly number[] {
  if (level === "steps" || level === "triads" || level === "two-hands") {
    const patterns =
      level === "steps"
        ? [
            [0, 1, 2, 3],
            [1, 2, 3, 4],
            [4, 3, 2, 1],
            [3, 2, 1, 0]
          ]
        : [
            [0, 2, 4, 2],
            [4, 2, 0, 2]
          ];
    return musicChoice(
      patterns.filter(
        (pattern) =>
          previous === undefined ||
          (pattern[0] !== undefined && intervalAllowed(previous, pattern[0], learned))
      ),
      random
    );
  }
  const positions: number[] = [];
  let last = previous;
  for (let index = 0; index < 4; index++) {
    const candidates = READING_PITCHES.map((_, position) => position).filter(
      (position) => last === undefined || intervalAllowed(last, position, learned)
    );
    last = musicChoice(candidates, random);
    positions.push(last);
  }
  return positions;
}

export function generateSightReadingMaterial(options: SightReadingOptions): SightReadingMaterial {
  if (!["notes", "steps", "triads", "two-hands"].includes(options.level))
    throw new RangeError("Invalid sight reading level");
  if (!["training", "control"].includes(options.purpose))
    throw new RangeError("Invalid sight reading purpose");
  const learnedIntervals = [...new Set(options.learnedIntervals ?? [1, 2, 3])].sort(
    (a, b) => a - b
  );
  if (
    learnedIntervals.length === 0 ||
    learnedIntervals.some((value) => !Number.isInteger(value) || value < 1 || value > 8)
  )
    throw new RangeError("Invalid learned written intervals");
  const needed = options.level === "notes" ? [1] : options.level === "steps" ? [2] : [3];
  if (needed.some((value) => !learnedIntervals.includes(value)))
    throw new RangeError("Sight reading groups require their studied intervals");
  const seed = normalizeReadingSeed(options.seed);
  const random = musicRandom(seed);
  const notes: MusicNote[] = [];
  const groups: SightReadingGroup[] = [];
  let previous: number | undefined;
  let previousBass: number | undefined;
  for (let index = 0; index < 4; index++) {
    const positions = groupPositions(options.level, previous, learnedIntervals, random);
    const rhythm = options.level === "notes" ? QUARTERS : musicChoice(RHYTHMS, random);
    let startBeat = index * 4;
    const pitches = positions.map((position) => {
      const pitch = READING_PITCHES[position];
      if (pitch === undefined) throw new RangeError("Invalid sight reading pitch position");
      return pitch;
    });
    pitches.forEach((pitch, noteIndex) => {
      const durationBeats = rhythm[noteIndex];
      if (durationBeats === undefined)
        throw new RangeError("Invalid sight reading rhythm position");
      notes.push({ pitch, startBeat, durationBeats, hand: "right" });
      startBeat += durationBeats;
    });
    if (options.level === "two-hands") {
      const bassPositions = [0, 1, 2, 3, 4].filter(
        (position) =>
          previousBass === undefined || intervalAllowed(previousBass, position, learnedIntervals)
      );
      previousBass = musicChoice(bassPositions, random);
      const bassPitch = READING_PITCHES[previousBass];
      if (bassPitch === undefined) throw new RangeError("Invalid sight reading bass position");
      notes.push({ pitch: bassPitch - 12, startBeat: index * 4, durationBeats: 4, hand: "left" });
    }
    groups.push({
      index,
      startBeat: index * 4,
      endBeat: (index + 1) * 4,
      pitches,
      kind: classifySightGroup(pitches)
    });
    previous = positions.at(-1);
  }
  return {
    id: `sight-v1-${options.level}-${options.purpose}-${String(seed)}-${learnedIntervals.join(".")}`,
    seed,
    generatorVersion: 1,
    notes,
    bpm: options.bpm ?? 80,
    level: options.level,
    purpose: options.purpose,
    learnedIntervals,
    groups
  };
}

export function generateSightReading(options: SightReadingOptions): SightReadingExercise {
  const plan = generateSightReadingMaterial(options);
  return {
    ...createMusicExercise(plan),
    level: plan.level,
    purpose: plan.purpose,
    learnedIntervals: plan.learnedIntervals,
    groups: plan.groups
  };
}

/** The initial five-white-key span is a chosen hand position, never a measured finger. */
export function assessSightStartingPosition(
  exercise: SightReadingExercise,
  hand: Hand,
  lowPitch: number
): {
  readonly suitable: boolean;
  readonly position: readonly number[];
  readonly required: readonly number[];
} {
  const positionIndex = WHITE_PITCHES.indexOf(lowPitch);
  const position = positionIndex < 0 ? [] : WHITE_PITCHES.slice(positionIndex, positionIndex + 5);
  const required = [
    ...new Set(
      exercise.notes
        .filter((note) => note.hand === hand && note.startBeat < 4)
        .map((note) => note.pitch)
    )
  ];
  return {
    suitable:
      required.length > 0 &&
      position.length === 5 &&
      required.every((pitch) => position.includes(pitch)),
    position,
    required
  };
}

export function assessSightGroup(
  exercise: SightReadingExercise,
  index: number,
  answer: SightGroupKind
): boolean {
  const group = exercise.groups[index];
  return group?.kind === answer;
}

/** Song beat comes from PracticeSession; the next group is readable before its first attack. */
export function sightReadingAhead(
  exercise: SightReadingExercise,
  songBeat: number
): readonly SightReadingGroup[] {
  if (!Number.isFinite(songBeat)) return [];
  const index = exercise.groups.findIndex((group) => songBeat < group.endBeat);
  return index < 0 ? [] : exercise.groups.slice(index, index + 2);
}
