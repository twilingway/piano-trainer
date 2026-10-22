import { songFromMusicXml } from "../song/musicxml";
import { normalizeReadingSeed, readingPitchesForSeed } from "./generator";
import { BASS_READING_PROFILE, TREBLE_READING_PROFILE } from "./profiles";
import { TWO_HAND_GENERATOR_VERSION, TWO_HAND_SKILL_ID } from "./twoHandTypes";
import type { TwoHandExercise, TwoHandPair } from "./twoHandTypes";
import type { ReadingHintLevel } from "./types";
export { TWO_HAND_GENERATOR_VERSION } from "./twoHandTypes";

const STEPS: Readonly<Record<number, string>> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G" };
export function twoHandPairsForSeed(seed: number, version = 1): readonly TwoHandPair[] {
  if (version !== TWO_HAND_GENERATOR_VERSION)
    throw new RangeError("Unsupported two-hand generator");
  const left = readingPitchesForSeed(seed, [2, 2, 2, 2, 2], BASS_READING_PROFILE);
  const right = readingPitchesForSeed(
    normalizeReadingSeed(seed) ^ 0x9e3779b9,
    [2, 2, 2, 2, 2],
    TREBLE_READING_PROFILE
  );
  for (let i = 1; i < left.length; i++) {
    if (left[i] !== left[i - 1] || right[i] !== right[i - 1]) continue;
    const swap = right.findIndex((pitch, j) => j > i && pitch !== right[i]);
    if (swap >= 0) [right[i], right[swap]] = [right[swap] ?? 60, right[i] ?? 60];
    else {
      const earlier = right.findIndex(
        (pitch, j) =>
          j < i - 1 &&
          pitch !== right[i] &&
          (left[j] !== left[j - 1] || right[i] !== right[j - 1]) &&
          (left[j] !== left[j + 1] || right[i] !== right[j + 1])
      );
      if (earlier >= 0) [right[i], right[earlier]] = [right[earlier] ?? 60, right[i] ?? 60];
      else return twoHandPairsForSeed((normalizeReadingSeed(seed) + 0x10000) >>> 0, version);
    }
  }
  return left.map((pitch, index) => ({
    id: `two-hand-pair-${String(index)}`,
    noteIds: [`p0n${String(index * 2 + 1)}`, `p0n${String(index * 2)}`],
    pitches: [pitch, right[index] ?? 60]
  }));
}
export function nextTwoHandSeed(seed: number): number {
  const previous = JSON.stringify(twoHandPairsForSeed(seed));
  let next = normalizeReadingSeed(seed);
  do {
    next = (next + 1) >>> 0;
  } while (JSON.stringify(twoHandPairsForSeed(next)) === previous);
  return next;
}
/** The name a hint writes under a note: letter and octave unless the interface supplies its own. */
export type TwoHandNoteLabel = (pitch: number) => string;
const letterLabel: TwoHandNoteLabel = (pitch) =>
  `${STEPS[pitch % 12] ?? "C"}${String(Math.floor(pitch / 12) - 1)}`;
function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function note(
  pitch: number,
  id: string,
  staff: number,
  hint: ReadingHintLevel,
  label: TwoHandNoteLabel = letterLabel
): string {
  const name = hint > 0 ? `<lyric><text>${xmlText(label(pitch))}</text></lyric>` : "";
  return `<note id="${id}"><pitch><step>${STEPS[pitch % 12] ?? "C"}</step><octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch><duration>1</duration><voice>${String(staff)}</voice><type>quarter</type><staff>${String(staff)}</staff>${name}</note>`;
}
function score(
  pairs: readonly TwoHandPair[],
  hint: ReadingHintLevel,
  label: TwoHandNoteLabel = letterLabel
): string {
  const attributes = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
  const measures = pairs.map(
    (pair, index) =>
      `<measure number="${String(index + 1)}" implicit="yes">${index === 0 ? `${attributes}<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>` : ""}${note(pair.pitches[1], pair.noteIds[1], 1, hint, label)}<backup><duration>1</duration></backup>${note(pair.pitches[0], pair.noteIds[0], 2, hint, label)}</measure>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
}
export function generateTwoHandExercise(seed: number, version = 1): TwoHandExercise {
  const normalized = normalizeReadingSeed(seed);
  const pairs = twoHandPairsForSeed(normalized, version);
  const musicXml = score(pairs, 0);
  return {
    skillId: TWO_HAND_SKILL_ID,
    task: "simultaneous",
    id: `two-hand-v1-${String(normalized)}`,
    seed: normalized,
    generatorVersion: 1,
    pairs,
    musicXml,
    song: songFromMusicXml(musicXml, "")
  };
}
export function twoHandPromptXml(
  exercise: TwoHandExercise,
  pairIndex: number,
  hintLevel: ReadingHintLevel = 0,
  label?: TwoHandNoteLabel
): { readonly musicXml: string; readonly beat: number } {
  const pair = exercise.pairs[pairIndex];
  if (!pair || !Number.isInteger(pairIndex)) throw new RangeError("Invalid two-hand pair index");
  return { musicXml: score([pair], hintLevel, label), beat: 0 };
}
