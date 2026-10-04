/** A tonic pitch class and mode, with the score's spelling when available. */
export interface Key {
  readonly tonic: number;
  readonly mode: "major" | "minor";
  readonly fifths?: number;
}

export type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface WrittenPitch {
  readonly step: PitchStep;
  readonly alter: number;
  readonly octave: number;
}

const STEPS: readonly PitchStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const STEP_NAMES = ["До", "Ре", "Ми", "Фа", "Соль", "Ля", "Си"];
const CANONICAL_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const SHARP_ORDER: readonly PitchStep[] = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: readonly PitchStep[] = ["B", "E", "A", "D", "G", "C", "F"];

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function keyFromFifths(fifths: number, mode: Key["mode"]): Key {
  return { tonic: modulo(7 * fifths + (mode === "minor" ? 9 : 0), 12), mode, fifths };
}

/** Authored signatures survive; inferred keys use the canonical -5..+6 spelling. */
export function fifthsForKey(key: Key): number {
  if (key.fifths !== undefined) return key.fifths;
  return CANONICAL_FIFTHS[modulo(key.tonic - (key.mode === "minor" ? 9 : 0), 12)] ?? 0;
}

/** Seven fifths per semitone, normalized only when the score is actually moved. */
export function transposeFifths(fifths: number, semitones: number): number {
  if (semitones === 0) return fifths;
  const moved = modulo(fifths + 7 * semitones, 12);
  return moved > 6 ? moved - 12 : moved;
}

export function transposeKey(key: Key, semitones: number): Key {
  if (semitones === 0) return key;
  return keyFromFifths(transposeFifths(fifthsForKey(key), semitones), key.mode);
}

function tonicSpelling(fifths: number, mode: Key["mode"]): { letter: number; alter: number } {
  const letter = modulo(4 * fifths + (mode === "minor" ? 5 : 0), 7);
  const step = STEPS[letter] ?? "C";
  const order = fifths < 0 ? FLAT_ORDER : SHARP_ORDER;
  const altered = order.slice(0, Math.abs(fifths)).includes(step);
  return { letter, alter: altered ? Math.sign(fifths) : 0 };
}

export function keyName(key: Key): string {
  const { letter, alter } = tonicSpelling(fifthsForKey(key), key.mode);
  const accidental = alter > 0 ? "-диез" : alter < 0 ? "-бемоль" : "";
  return `${STEP_NAMES[letter] ?? "До"}${accidental} ${key.mode === "major" ? "мажор" : "минор"}`;
}

/** The upward fifth is preferred to a downward fourth: shifts stay within -4..+7. */
export function shiftBetween(from: number, to: number): number {
  const up = modulo(to - from, 12);
  return up > 7 ? up - 12 : up;
}

/** Preserve the written diatonic interval as well as the exact sounding pitch. */
export function transposeWrittenPitch(
  pitch: WrittenPitch,
  sourceFifths: number,
  semitones: number
): WrittenPitch {
  if (semitones === 0) return pitch;
  const source = tonicSpelling(sourceFifths, "major");
  const target = tonicSpelling(transposeFifths(sourceFifths, semitones), "major");
  const sourceAnchor = (NATURAL_PITCHES[source.letter] ?? 0) + source.alter;
  const targetAnchor = (NATURAL_PITCHES[target.letter] ?? 0) + target.alter;
  const octaveOffset = (sourceAnchor + semitones - targetAnchor) / 12;
  const diatonicShift = target.letter - source.letter + 7 * octaveOffset;
  const sourceLetter = STEPS.indexOf(pitch.step);
  const writtenPosition = pitch.octave * 7 + sourceLetter + diatonicShift;
  const letter = modulo(writtenPosition, 7);
  const octave = Math.floor(writtenPosition / 7);
  const sounding = (pitch.octave + 1) * 12 + (NATURAL_PITCHES[sourceLetter] ?? 0) + pitch.alter;
  const alter = sounding + semitones - ((octave + 1) * 12 + (NATURAL_PITCHES[letter] ?? 0));
  return { step: STEPS[letter] ?? "C", alter, octave };
}
