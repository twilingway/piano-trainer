import { songFromMusicXml } from "../song/musicxml";
import type { ReadingExercise, ReadingTask } from "./types";

export const READING_GENERATOR_VERSION = 1;
export const READING_PITCHES = [60, 62, 64, 65, 67] as const;

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError("Reading seed must be finite");
  return seed >>> 0;
}

function pitchesForSeed(seed: number): number[] {
  let state = normalizeSeed(seed);
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pitches: number[] = Array.from({ length: 4 }, () => [...READING_PITCHES]).flat();
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
  const previous = pitchesForSeed(seed);
  let next = normalizeSeed(seed);
  if (task === "check") next = (next + 1) >>> 0;
  do {
    next = (next + 1) >>> 0;
  } while (pitchesForSeed(next).every((pitch, index) => pitch === previous[index]));
  return next;
}

const ATTRIBUTES = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>
<clef><sign>G</sign><line>2</line></clef></attributes>`;
const STEPS: Readonly<Record<number, string>> = { 60: "C", 62: "D", 64: "E", 65: "F", 67: "G" };

function musicXmlForPitches(pitches: readonly number[]): string {
  const measures = Array.from({ length: 5 }, (_, measure) => {
    const notes = pitches.slice(measure * 4, measure * 4 + 4).map(
      (pitch, index) => `<note id="reading-n${String(measure * 4 + index)}">
<pitch><step>${STEPS[pitch] ?? "C"}</step><octave>4</octave></pitch>
<duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`
    );
    const header = measure === 0 ? `${ATTRIBUTES}<direction><sound tempo="120"/></direction>` : "";
    return `<measure number="${String(measure + 1)}">${header}${notes.join("")}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1">${measures.join("")}</part></score-partwise>`;
}

/** The full source score is parsed once into the single musical session for this series. */
export function generateReadingExercise(task: ReadingTask, seed: number): ReadingExercise {
  const normalized = normalizeSeed(seed);
  const musicXml = musicXmlForPitches(pitchesForSeed(normalized));
  return {
    id: `reading-v${String(READING_GENERATOR_VERSION)}-${task}-${String(normalized)}`,
    task,
    seed: normalized,
    generatorVersion: READING_GENERATOR_VERSION,
    musicXml,
    song: songFromMusicXml(musicXml, "")
  };
}
