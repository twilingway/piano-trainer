import { songFromMusicXml } from "../song/musicxml";
import { INTERVAL_CATEGORIES } from "./types";
import type { IntervalCategory, IntervalExercise, IntervalMode, IntervalPair } from "./types";

export const INTERVAL_GENERATOR_VERSION = 1;
export const INTERVAL_PITCHES = [60, 62, 64, 65, 67] as const;
const CATEGORY_STEPS: Readonly<Record<IntervalCategory, number>> = {
  repeat: 0,
  "step-up": 1,
  "step-down": -1,
  "third-up": 2,
  "third-down": -2
};
const PITCH_STEPS: Readonly<Record<number, string>> = {
  60: "C",
  62: "D",
  64: "E",
  65: "F",
  67: "G"
};

/** Classification follows written diatonic steps, independently of semitone distance. */
export function classifyInterval(anchorMidi: number, targetMidi: number): IntervalCategory {
  const anchor = INTERVAL_PITCHES.indexOf(anchorMidi as (typeof INTERVAL_PITCHES)[number]);
  const target = INTERVAL_PITCHES.indexOf(targetMidi as (typeof INTERVAL_PITCHES)[number]);
  if (anchor < 0 || target < 0) throw new RangeError("Interval pitches must be C4-G4 white notes");
  const category = INTERVAL_CATEGORIES.find((value) => CATEGORY_STEPS[value] === target - anchor);
  if (!category) throw new RangeError("Only repeats, steps and thirds are supported");
  return category;
}

function normalizedSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new RangeError("Interval seed must be finite");
  return seed >>> 0;
}

function pairsForSeed(seed: number): readonly Omit<IntervalPair, "questionId" | "noteIds">[] {
  let state = normalizedSeed(seed);
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const categories = [...INTERVAL_CATEGORIES, ...INTERVAL_CATEGORIES];
  for (let index = categories.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const current = categories[index];
    const replacement = categories[other];
    if (current && replacement) {
      categories[index] = replacement;
      categories[other] = current;
    }
  }
  return categories.map((category, index) => {
    const step = CATEGORY_STEPS[category];
    const anchors = INTERVAL_PITCHES.filter(
      (_, position) => position + step >= 0 && position + step < 5
    );
    const anchorMidi = anchors[Math.floor(random() * anchors.length)] ?? 60;
    const anchor = INTERVAL_PITCHES.indexOf(anchorMidi);
    return { index, category, anchorMidi, targetMidi: INTERVAL_PITCHES[anchor + step] ?? 60 };
  });
}

function score(pairs: readonly IntervalPair[]): string {
  const attributes = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>
<clef><sign>G</sign><line>2</line></clef></attributes>
<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute>
</metronome></direction-type><sound tempo="120"/></direction>`;
  const measures = Array.from({ length: 5 }, (_, measure) => {
    const notes = pairs.slice(measure * 2, measure * 2 + 2).flatMap((pair) =>
      [pair.anchorMidi, pair.targetMidi].map(
        (pitch, role) => `<note id="${pair.noteIds[role] ?? ""}">
<pitch><step>${PITCH_STEPS[pitch] ?? "C"}</step><octave>4</octave></pitch>
<duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`
      )
    );
    return `<measure number="${String(measure + 1)}">${measure === 0 ? attributes : ""}${notes.join("")}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1">${measures.join("")}</part></score-partwise>`;
}

export function generateIntervalExercise(
  mode: IntervalMode,
  seed: number,
  version = INTERVAL_GENERATOR_VERSION
): IntervalExercise {
  if (!["see-and-play", "hear-and-choose"].includes(mode))
    throw new RangeError("Invalid interval mode");
  if (version !== INTERVAL_GENERATOR_VERSION)
    throw new RangeError("Unsupported interval generator version");
  const normalized = normalizedSeed(seed);
  const id = `interval-v${String(version)}-${mode}-${String(normalized)}`;
  const pairs: IntervalPair[] = pairsForSeed(normalized).map((pair) => ({
    ...pair,
    questionId: `${id}:q${String(pair.index)}`,
    noteIds: [`p0n${String(pair.index * 2)}`, `p0n${String(pair.index * 2 + 1)}`]
  }));
  const musicXml = score(pairs);
  return {
    id,
    mode,
    seed: normalized,
    generatorVersion: version,
    pairs,
    musicXml,
    song: songFromMusicXml(musicXml, "")
  };
}

export function nextIntervalSeed(seed: number): number {
  const previous = pairsForSeed(seed);
  let next = normalizedSeed(seed);
  do {
    next = (next + 1) >>> 0;
  } while (
    pairsForSeed(next).every((pair, index) => {
      const before = previous[index];
      return pair.anchorMidi === before?.anchorMidi && pair.targetMidi === before.targetMidi;
    })
  );
  return next;
}
