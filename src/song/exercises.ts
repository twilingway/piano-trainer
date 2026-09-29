/*
 * Built-in exercises, written out as MusicXML so they get a staff like any
 * loaded score. Both hands play the same line an octave apart, in quarters.
 */

export interface Exercise {
  readonly id: string;
  readonly title: string;
  readonly musicXml: string;
}

const SPELLING: readonly (readonly [string, number])[] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0]
];

const BEATS_PER_MEASURE = 4;

function noteXml(pitch: number | undefined, staff: 1 | 2): string {
  const voice = staff === 1 ? 1 : 5;
  const tail = `<duration>1</duration><voice>${String(voice)}</voice><type>quarter</type><staff>${String(staff)}</staff>`;
  if (pitch === undefined) return `<note><rest/>${tail}</note>`;
  const [step, alter] = SPELLING[pitch % 12] ?? ["C", 0];
  const octave = Math.floor(pitch / 12) - 1;
  const alterXml = alter === 0 ? "" : `<alter>${String(alter)}</alter>`;
  return `<note><pitch><step>${step}</step>${alterXml}<octave>${String(octave)}</octave></pitch>${tail}</note>`;
}

function exerciseXml(title: string, rightHand: readonly number[], tempo: number): string {
  const measures: string[] = [];
  const count = Math.ceil(rightHand.length / BEATS_PER_MEASURE);
  for (let measure = 0; measure < count; measure++) {
    const slice = Array.from(
      { length: BEATS_PER_MEASURE },
      (_, beat) => rightHand[measure * BEATS_PER_MEASURE + beat]
    );
    const head =
      measure === 0
        ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>` +
          `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${String(tempo)}</per-minute></metronome></direction-type><sound tempo="${String(tempo)}"/></direction>`
        : "";
    const right = slice.map((pitch) => noteXml(pitch, 1)).join("");
    const left = slice
      .map((pitch) => noteXml(pitch === undefined ? undefined : pitch - 12, 2))
      .join("");
    measures.push(
      `<measure number="${String(measure + 1)}">${head}${right}<backup><duration>${String(BEATS_PER_MEASURE)}</duration></backup>${left}</measure>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
}

const C4 = 60;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];

const FIVE_FINGER = [0, 2, 4, 5, 7, 5, 4, 2, 0].map((step) => C4 + step);
const SCALE_UP = MAJOR_STEPS.map((step) => C4 + step);
const SCALE = [...SCALE_UP, ...[...SCALE_UP].reverse().slice(1)];

export const EXERCISES: readonly Exercise[] = [
  {
    id: "five-finger-c",
    title: "Позиция до: пять пальцев",
    musicXml: exerciseXml("Позиция до: пять пальцев", FIVE_FINGER, 72)
  },
  {
    id: "scale-c",
    title: "Гамма до мажор: подкладывание",
    musicXml: exerciseXml("Гамма до мажор: подкладывание", SCALE, 72)
  }
];
