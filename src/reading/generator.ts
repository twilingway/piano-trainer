import { songFromMusicXml } from "../song/musicxml";
import type { ReadingExercise, ReadingTask } from "./types";
import type { ReadingPlan } from "./progressTypes";
import { TREBLE_READING_PROFILE } from "./profiles";
import type { ReadingProfileDefinition } from "./profiles";

export const READING_GENERATOR_VERSION = 1;
export const READING_PITCHES = [60, 62, 64, 65, 67] as const;

export function normalizeReadingSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError("Reading seed must be finite");
  return seed >>> 0;
}

export function readingPitchesForSeed(
  seed: number,
  counts?: readonly number[],
  profile: ReadingProfileDefinition = TREBLE_READING_PROFILE
): number[] {
  let state = normalizeReadingSeed(seed);
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pitches: number[] = counts
    ? profile.pitches.flatMap((pitch, index) => Array<number>(counts[index] ?? 0).fill(pitch))
    : Array.from({ length: 4 }, () => [...profile.pitches]).flat();
  for (let index = pitches.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const value = pitches[index];
    const replacement = pitches[other];
    if (value === undefined || replacement === undefined) continue;
    pitches[index] = replacement;
    pitches[other] = value;
  }
  return pitches;
}

/** New series differ in their musical order, not just in their exercise id. */
export function nextReadingSeed(seed: number, task: ReadingTask): number {
  // Tasks share the same v1 pitch generator; the task remains part of exercise identity.
  const previous = readingPitchesForSeed(seed);
  let next = normalizeReadingSeed(seed);
  if (task === "check") next = (next + 1) >>> 0;
  do {
    next = (next + 1) >>> 0;
  } while (readingPitchesForSeed(next).every((pitch, index) => pitch === previous[index]));
  return next;
}

function attributes(profile: ReadingProfileDefinition): string {
  return `<attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>
<clef><sign>${profile.clef}</sign><line>${String(profile.clefLine)}</line></clef></attributes>`;
}
const STEPS: Readonly<Record<number, string>> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G" };

export function readingMusicXmlForPitches(
  pitches: readonly number[],
  profile: ReadingProfileDefinition = TREBLE_READING_PROFILE
): string {
  const measures = Array.from({ length: 5 }, (_, measure) => {
    const notes = pitches.slice(measure * 4, measure * 4 + 4).map(
      (pitch, index) => `<note id="${profile.noteIdPrefix}${String(measure * 4 + index)}">
<pitch><step>${STEPS[pitch % 12] ?? "C"}</step><octave>${String(profile.octave)}</octave></pitch>
<duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`
    );
    const header =
      measure === 0
        ? `${attributes(profile)}<direction><direction-type><metronome><beat-unit>quarter</beat-unit>
<per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>`
        : "";
    return `<measure number="${String(measure + 1)}">${header}${notes.join("")}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1">${measures.join("")}</part></score-partwise>`;
}

/** The full source score is parsed once into the single musical session for this series. */
export function generateReadingExercise(
  task: ReadingTask,
  seed: number,
  plan?: ReadingPlan
): ReadingExercise {
  const normalized = normalizeReadingSeed(seed);
  const version = plan?.generatorVersion ?? READING_GENERATOR_VERSION;
  const musicXml = readingMusicXmlForPitches(readingSequenceForSeed(normalized, plan));
  return {
    ...(plan ? { plan } : {}),
    id: `reading-v${String(version)}-${task}-${String(normalized)}${version === 2 ? `-${plan?.purpose ?? task}-${plan?.counts.join(".") ?? ""}` : ""}`,
    task,
    seed: normalized,
    generatorVersion: version,
    musicXml,
    song: songFromMusicXml(musicXml, "")
  };
}

/** Candidate search never parses thousands of rejected XML scores. */
export function readingSequenceForSeed(seed: number, plan?: ReadingPlan): readonly number[] {
  if (
    plan &&
    (![1, 2].includes(plan.generatorVersion) ||
      plan.counts.length !== 5 ||
      plan.counts.some((count) => !Number.isInteger(count) || count < 0) ||
      plan.counts.reduce((sum, count) => sum + count, 0) !== 20 ||
      (plan.generatorVersion === 1 && plan.counts.some((count) => count !== 4)))
  )
    throw new RangeError("Invalid reading generation plan");
  const version = plan?.generatorVersion ?? READING_GENERATOR_VERSION;
  return readingPitchesForSeed(seed, version === 2 ? plan?.counts : undefined);
}
