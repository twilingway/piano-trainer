import { withLessonFingering } from "./fingerCues";
import { songFromMusicXml } from "../song/musicxml";
import { normalizeReadingSeed, readingPitchesForSeed } from "./generator";
import { BASS_READING_PROFILE } from "./profiles";
import { HELD_BASS_GENERATOR_VERSION, HELD_BASS_SKILL_ID } from "./heldBassTypes";
import type { HeldBassExercise, HeldBassFragment } from "./heldBassTypes";
import type { ReadingHintLevel } from "./types";
export { HELD_BASS_GENERATOR_VERSION } from "./heldBassTypes";

const STEPS: Readonly<Record<number, string>> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G" };
const PITCHES = [60, 62, 64, 65, 67] as const;
function note(pitch: number, duration: number, staff: number, reveal: boolean): string {
  const type = duration === 4 ? "whole" : duration === 2 ? "half" : "quarter";
  const name = reveal
    ? `<lyric><text>${STEPS[pitch % 12] ?? "C"}${String(Math.floor(pitch / 12) - 1)}</text></lyric>`
    : "";
  return `<note><pitch><step>${STEPS[pitch % 12] ?? "C"}</step><octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch><duration>${String(duration)}</duration><voice>${String(staff)}</voice><type>${type}</type><staff>${String(staff)}</staff>${name}</note>`;
}
function score(
  bass: number,
  melody: readonly number[],
  step = -1,
  hint: ReadingHintLevel = 0
): string {
  const attributes = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
  const tempo = `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>`;
  const notes = melody
    .map((pitch, index) => note(pitch, 1, 1, hint > 0 && index === step))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1"${melody.length === 2 ? ' implicit="yes"' : ""}>${attributes}${tempo}${notes}<backup><duration>${String(melody.length)}</duration></backup>${note(bass, melody.length, 2, hint > 0)}</measure></part></score-partwise>`;
}
export function heldBassFragmentsForSeed(seed: number, version = 1): readonly HeldBassFragment[] {
  if (version !== HELD_BASS_GENERATOR_VERSION)
    throw new RangeError("Unsupported held-bass generator");
  const normalized = normalizeReadingSeed(seed);
  let state = normalized ^ 0xa511e9b3;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const lengths = [2, 2, 2, 2, 2, 4, 4, 4, 4, 4];
  for (let index = lengths.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [lengths[index], lengths[other]] = [lengths[other] ?? 2, lengths[index] ?? 2];
  }
  const bass = readingPitchesForSeed(normalized, [2, 2, 2, 2, 2], BASS_READING_PROFILE);
  const fragments: HeldBassFragment[] = [];
  for (let index = 0; index < 10; index++) {
    const melody = Array.from(
      { length: lengths[index] ?? 2 },
      () => PITCHES[Math.floor(random() * 5)] ?? 60
    );
    const bassPitch = bass[index] ?? 48;
    const previous = fragments.at(-1);
    if (
      previous?.bassPitch === bassPitch &&
      JSON.stringify(previous.melodyPitches) === JSON.stringify(melody)
    )
      melody[0] = PITCHES[(PITCHES.indexOf(melody[0] ?? 60) + 1) % 5] ?? 60;
    const musicXml = score(bassPitch, melody);
    const song = withLessonFingering(songFromMusicXml(musicXml, ""));
    const bassNoteId = `p0n${String(melody.length)}`;
    const melodyNoteIds = melody.map((_, step) => `p0n${String(step)}`);
    fragments.push({
      id: `held-bass-fragment-${String(index)}`,
      bassPitch,
      melodyPitches: melody,
      bassNoteId,
      melodyNoteIds,
      steps: melodyNoteIds.map((id, step) => (step === 0 ? [bassNoteId, id] : [id])),
      musicXml,
      song
    });
  }
  return fragments;
}
export function generateHeldBassExercise(seed: number, version = 1): HeldBassExercise {
  const normalized = normalizeReadingSeed(seed);
  return {
    skillId: HELD_BASS_SKILL_ID,
    task: "held-bass",
    id: `held-bass-v1-${String(normalized)}`,
    seed: normalized,
    generatorVersion: 1,
    fragments: heldBassFragmentsForSeed(normalized, version)
  };
}
export function nextHeldBassSeed(seed: number): number {
  const material = (value: number): string =>
    JSON.stringify(
      heldBassFragmentsForSeed(value).map((fragment) => [
        fragment.bassPitch,
        fragment.melodyPitches
      ])
    );
  const previous = material(seed);
  let next = normalizeReadingSeed(seed);
  do {
    next = (next + 1) >>> 0;
  } while (material(next) === previous);
  return next;
}
export function heldBassPromptXml(
  fragment: HeldBassFragment,
  step: number,
  hintLevel: ReadingHintLevel = 0
): string {
  return score(fragment.bassPitch, fragment.melodyPitches, step, hintLevel);
}
