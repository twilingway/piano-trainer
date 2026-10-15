import { songFromMusicXml } from "../song/musicxml";
import { normalizeReadingSeed } from "../reading/generator";
import { INDEPENDENT_RHYTHM_SKILL_ID } from "./types";
import type { IndependentRhythmExercise, IndependentRhythmPhaseExercise } from "./types";

const ORDERS = ["AABB", "ABAB", "ABBA", "BAAB", "BABA", "BBAA"] as const;
function note(pitch: number, duration: number, staff: number): string {
  return `<note><pitch><step>C</step><octave>${String(pitch / 12 - 1)}</octave></pitch><duration>${String(duration)}</duration><voice>${String(staff)}</voice><type>${duration === 2 ? "half" : "quarter"}</type><staff>${String(staff)}</staff></note>`;
}
function phaseScore(phase: "pulse" | "two-hands", order: readonly ("A" | "B")[]): string {
  const attrs = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
  const tempo = `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>`;
  const measures = (phase === "pulse" ? ["A", "A"] : order)
    .map((pattern, index) => {
      const rightDuration = phase === "pulse" || pattern === "A" ? 1 : 2;
      const right = Array.from({ length: 4 / rightDuration }, () =>
        note(60, rightDuration, 1)
      ).join("");
      const leftDuration = pattern === "A" ? 2 : 1;
      const left =
        phase === "pulse"
          ? `<note><rest measure="yes"/><duration>4</duration><voice>2</voice><staff>2</staff></note>`
          : Array.from({ length: 4 / leftDuration }, () => note(48, leftDuration, 2)).join("");
      return `<measure number="${String(index + 1)}">${index === 0 ? attrs + tempo : ""}${right}<backup><duration>4</duration></backup>${left}</measure>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
function makePhase(
  id: string,
  phase: "pulse" | "two-hands",
  order: readonly ("A" | "B")[]
): IndependentRhythmPhaseExercise {
  const musicXml = phaseScore(phase, order);
  return { id: `${id}:${phase}`, phase, musicXml, song: songFromMusicXml(musicXml, "") };
}
export function generateIndependentRhythmExercise(
  seed: number,
  version = 1
): IndependentRhythmExercise {
  if (version !== 1) throw new RangeError("Unsupported independent rhythm generator");
  const normalized = normalizeReadingSeed(seed);
  const id = `independent-rhythm-v1-${String(normalized)}`;
  const order = Array.from(ORDERS[normalized % 6] ?? "AABB") as ("A" | "B")[];
  return {
    id,
    seed: normalized,
    generatorVersion: 1,
    rulesVersion: 1,
    skillId: INDEPENDENT_RHYTHM_SKILL_ID,
    order,
    pulse: makePhase(id, "pulse", order),
    series: makePhase(id, "two-hands", order)
  };
}
export function nextIndependentRhythmSeed(seed: number): number {
  const current = normalizeReadingSeed(seed);
  let next = current;
  do {
    next = (next + 1) >>> 0;
  } while (next % 6 === current % 6);
  return next;
}
/** Stable score identity includes parsed IDs, hands, onsets and duration as well as XML. */
export function independentRhythmFingerprint(phase: IndependentRhythmPhaseExercise): string {
  const material = JSON.stringify([
    phase.musicXml,
    phase.song.notes.map(({ id, pitch, hand, start, duration }) => [
      id,
      pitch,
      hand,
      start,
      duration
    ]),
    phase.song.duration
  ]);
  let hash = 2166136261;
  for (let index = 0; index < material.length; index++)
    hash = Math.imul(hash ^ material.charCodeAt(index), 16777619) >>> 0;
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}
