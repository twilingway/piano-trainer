import { withLessonFingering } from "../reading/fingerCues";
import { songFromMusicXml } from "../song/musicxml";
import { withFingering } from "../song/song";
import type { ReadingExercise } from "../reading/types";
import { beginnerStage, type BeginnerSelection } from "./catalog";
export const BEGINNER_GENERATOR_VERSION = 1;
const STEPS: Readonly<Record<number, string>> = {
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B"
};
export function beginnerPitches(selection: BeginnerSelection): readonly number[] {
  const stage = beginnerStage(selection.stageId);
  let state = selection.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Every pitch is heard at least once; the introduced pitch starts the series.
  const pitches = Array.from(
    { length: stage.targetCount },
    (_, i) => stage.pitches[i % stage.count] ?? 60
  );
  for (let i = pitches.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pitches[i], pitches[j]] = [pitches[j] ?? 60, pitches[i] ?? 60];
  }
  const newest = stage.pitches.at(-1) ?? 60;
  const index = pitches.indexOf(newest);
  [pitches[0], pitches[index]] = [newest, pitches[0] ?? newest];
  return pitches;
}
export function generateBeginnerExercise(selection: BeginnerSelection): ReadingExercise {
  const stage = beginnerStage(selection.stageId);
  const pitches = beginnerPitches(selection);
  const measures = Array.from({ length: Math.ceil(pitches.length / 4) }, (_, m) => {
    const slice = pitches.slice(m * 4, m * 4 + 4);
    const attributes =
      m === 0
        ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${stage.hand === "left" ? "F" : "G"}</sign><line>${stage.hand === "left" ? "4" : "2"}</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>`
        : "";
    return `<measure number="${String(m + 1)}"${slice.length < 4 ? ' implicit="yes"' : ""}>${attributes}${slice.map((pitch, i) => `<note id="beginner-${String(m * 4 + i)}"><pitch><step>${STEPS[pitch % 12] ?? "C"}</step><octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join("")}</measure>`;
  });
  const musicXml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
  const parsed = songFromMusicXml(musicXml, "");
  const finger = stage.count <= 5 ? withLessonFingering : withFingering;
  const song = finger({
    ...parsed,
    notes: parsed.notes.map((note) => ({ ...note, hand: stage.hand }))
  });
  return {
    id: `${stage.id}-${selection.phase}-${String(selection.seed >>> 0)}`,
    generatorVersion: 1,
    skillId: stage.hand === "left" ? "bass-note-reading" : "note-reading",
    seed: selection.seed >>> 0,
    task: selection.phase === "independent" ? "check" : stage.count >= 3 ? "phrases" : "notes",
    musicXml,
    song
  };
}
