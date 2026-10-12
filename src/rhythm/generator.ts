import { songFromMusicXml } from "../song/musicxml";
import { secondsAt } from "../song/song";
import { RHYTHM_BPMS } from "./types";
import type { RhythmBpm, RhythmExercise, RhythmRest } from "./types";

export const RHYTHM_GENERATOR_VERSION = 1;
type Symbol = "Q" | "H" | "R";
const TEMPLATES: readonly (readonly Symbol[])[] = [
  ["Q", "Q", "Q", "Q"],
  ["H", "Q", "R"],
  ["Q", "H", "R"],
  ["Q", "R", "Q", "R"]
];

function shuffledTemplates(seed: number): (readonly Symbol[])[] {
  let state = seed;
  const templates = [...TEMPLATES];
  for (let index = templates.length - 1; index > 0; index--) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const other = Math.floor((((value ^ (value >>> 14)) >>> 0) / 4_294_967_296) * (index + 1));
    const current = templates[index];
    const replacement = templates[other];
    if (current && replacement) {
      templates[index] = replacement;
      templates[other] = current;
    }
  }
  return templates;
}

function score(seed: number, bpm: RhythmBpm): string {
  const attributes = `<attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves>
<clef><sign>G</sign><line>2</line></clef></attributes>
<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${String(bpm)}</per-minute>
</metronome></direction-type><sound tempo="${String(bpm)}"/></direction>`;
  const measures = shuffledTemplates(seed).map((template, index) => {
    const notes = template.map((symbol) => {
      const duration = symbol === "H" ? 2 : 1;
      const pitch = symbol === "R" ? "<rest/>" : "<pitch><step>C</step><octave>4</octave></pitch>";
      return `<note>${pitch}<duration>${String(duration)}</duration><voice>1</voice>
<type>${symbol === "H" ? "half" : "quarter"}</type><staff>1</staff></note>`;
    });
    return `<measure number="${String(index + 1)}">${index === 0 ? attributes : ""}${notes.join("")}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1">${measures.join("")}</part></score-partwise>`;
}

/** Rest intervals are read from the same score rather than duplicated from template data. */
function restsFromScore(musicXml: string, bpm: RhythmBpm): RhythmRest[] {
  const document = new DOMParser().parseFromString(musicXml, "application/xml");
  const rests: RhythmRest[] = [];
  let beat = 0;
  for (const note of Array.from(document.querySelectorAll("part > measure > note"))) {
    const duration = Number(note.querySelector(":scope > duration")?.textContent);
    if (note.querySelector(":scope > rest"))
      rests.push({ startS: (beat * 60) / bpm, endS: ((beat + duration) * 60) / bpm });
    beat += duration;
  }
  return rests;
}

export function generateRhythmExercise(
  seed: number,
  bpm: RhythmBpm = 60,
  version = RHYTHM_GENERATOR_VERSION
): RhythmExercise {
  if (!Number.isFinite(seed)) throw new RangeError("Rhythm seed must be finite");
  if (!RHYTHM_BPMS.includes(bpm)) throw new RangeError("Unsupported rhythm tempo");
  if (version !== RHYTHM_GENERATOR_VERSION) throw new RangeError("Unsupported rhythm generator");
  const normalizedSeed = seed >>> 0;
  const musicXml = score(normalizedSeed, bpm);
  const parsedSong = songFromMusicXml(musicXml, "");
  const finalMeasure = parsedSong.measures.at(-1);
  const durationS = secondsAt(parsedSong, (finalMeasure?.start ?? 0) + (finalMeasure?.length ?? 0));
  const song = { ...parsedSong, duration: durationS };
  return {
    id: `rhythm-v${String(version)}-${String(normalizedSeed)}-${String(bpm)}`,
    seed: normalizedSeed,
    generatorVersion: version,
    bpm,
    musicXml,
    song,
    onsets: song.notes.map((note) => ({ id: note.id, timeS: note.start })),
    rests: restsFromScore(musicXml, bpm),
    durationS
  };
}
