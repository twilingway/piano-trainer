/*
 * Built-in lessons, written out as MusicXML so they get a staff like any
 * loaded score. Each hand is a line of "note:length" tokens, where the length
 * counts sixteenths ("C4:4" is a quarter C4, "r:2" an eighth rest) and "|"
 * ends a measure.
 */

export interface Exercise {
  readonly id: string;
  readonly title: string;
  readonly musicXml: string;
}

const STEPS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

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

/** Sixteenths -> MusicXML note type and whether it is dotted. */
const NOTE_TYPES: Readonly<Record<number, readonly [string, boolean]>> = {
  1: ["16th", false],
  2: ["eighth", false],
  3: ["eighth", true],
  4: ["quarter", false],
  6: ["quarter", true],
  8: ["half", false],
  12: ["half", true],
  16: ["whole", false]
};

interface Token {
  /** MIDI pitch, or undefined for a rest. */
  readonly pitch: number | undefined;
  readonly sixteenths: number;
}

function parsePitch(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  const step = match?.[1] ? STEPS[match[1]] : undefined;
  if (!match?.[3] || step === undefined) throw new Error(`Bad note ${name}`);
  return (Number(match[3]) + 1) * 12 + step + (match[2] === "#" ? 1 : 0);
}

function parseLine(line: string): Token[][] {
  return line.split("|").map((measure) =>
    measure
      .trim()
      .split(/\s+/)
      .filter((token) => token !== "")
      .map((token) => {
        const [name = "", length = ""] = token.split(":");
        return { pitch: name === "r" ? undefined : parsePitch(name), sixteenths: Number(length) };
      })
  );
}

function noteXml(token: Token, staff: 1 | 2): string {
  const [type, dotted] = NOTE_TYPES[token.sixteenths] ?? ["quarter", false];
  const voice = staff === 1 ? 1 : 5;
  const tail =
    `<duration>${String(token.sixteenths)}</duration><voice>${String(voice)}</voice>` +
    `<type>${type}</type>${dotted ? "<dot/>" : ""}<staff>${String(staff)}</staff>`;
  if (token.pitch === undefined) return `<note><rest/>${tail}</note>`;
  const [step, alter] = SPELLING[token.pitch % 12] ?? ["C", 0];
  const octave = Math.floor(token.pitch / 12) - 1;
  const alterXml = alter === 0 ? "" : `<alter>${String(alter)}</alter>`;
  return `<note><pitch><step>${step}</step>${alterXml}<octave>${String(octave)}</octave></pitch>${tail}</note>`;
}

const sixteenthsOf = (tokens: readonly Token[]) =>
  tokens.reduce((sum, token) => sum + token.sixteenths, 0);

/** A two-staff piano score in 4/4, C major. A short first measure is written as a pickup. */
function scoreXml(title: string, tempo: number, right: string, left: string): string {
  const rightMeasures = parseLine(right);
  const leftMeasures = parseLine(left);
  if (rightMeasures.length !== leftMeasures.length) {
    throw new Error(`${title}: hands have different measure counts`);
  }
  const measures = rightMeasures.map((rightTokens, index) => {
    const leftTokens = leftMeasures[index] ?? [];
    const length = sixteenthsOf(rightTokens);
    if (sixteenthsOf(leftTokens) !== length) {
      throw new Error(`${title}: measure ${String(index + 1)} differs between hands`);
    }
    const head =
      index === 0
        ? `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>` +
          `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${String(tempo)}</per-minute></metronome></direction-type><sound tempo="${String(tempo)}"/></direction>`
        : "";
    const implicit = index === 0 && length < 16 ? ` implicit="yes"` : "";
    const rightXml = rightTokens.map((token) => noteXml(token, 1)).join("");
    const leftXml = leftTokens.map((token) => noteXml(token, 2)).join("");
    return `<measure number="${String(index + 1)}"${implicit}>${head}${rightXml}<backup><duration>${String(length)}</duration></backup>${leftXml}</measure>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
}

/** Both hands on the same line an octave apart, in quarters, four to a measure. */
function unisonQuarters(names: readonly string[]): { right: string; left: string } {
  const lower = (name: string) => name.replace(/\d$/, (octave) => String(Number(octave) - 1));
  const measures = (transform: (name: string) => string) => {
    const tokens = names.map((name) => `${transform(name)}:4`);
    while (tokens.length % 4 !== 0) tokens.push("r:4");
    const bars: string[] = [];
    for (let index = 0; index < tokens.length; index += 4) {
      bars.push(tokens.slice(index, index + 4).join(" "));
    }
    return bars.join(" | ");
  };
  return { right: measures((name) => name), left: measures(lower) };
}

const FIVE_FINGER = unisonQuarters(["C4", "D4", "E4", "F4", "G4", "F4", "E4", "D4", "C4"]);
const SCALE_C = unisonQuarters([..."C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4".split(" ")]);

/*
 * State Anthem of the Russian Federation, music by A. V. Alexandrov: one verse
 * and the chorus with the final ending. The melody follows the official 2001
 * edition (Muzyka); where the voice line splits, the upper voice is the tune.
 * The left hand is a teaching bass: the root of each harmony from the full
 * accompaniment, an octave up so it sits in the middle of the keyboard.
 */
const ANTHEM_RIGHT = [
  "G4:2",
  "C5:4 G4:3 A4:1 B4:4 E4:2 E4:2",
  "A4:4 G4:3 F4:1 G4:4 C4:2 C4:2",
  "D4:4 D4:3 E4:1 F4:4 F4:3 G4:1",
  "A4:4 B4:2 C5:2 D5:6 G4:2",
  "E5:4 D5:3 C5:1 D5:4 B4:2 G4:2",
  "C5:4 B4:3 A4:1 B4:4 E4:2 E4:2",
  "A4:4 G4:3 F4:1 G4:4 C4:3 C4:1",
  "C5:4 B4:3 A4:1 G4:8",
  "E5:8 D5:2 C5:2 B4:2 C5:2",
  "D5:6 G4:2 G4:4 r:4",
  "C5:8 B4:2 A4:2 G4:2 A4:2",
  "B4:6 E4:2 E4:4 r:4",
  "C5:4 A4:3 B4:1 C5:4 A4:3 B4:1",
  "C5:4 A4:2 C5:2 F5:6 r:2",
  "F5:8 E5:2 D5:2 C5:2 D5:2",
  "E5:6 C5:2 C5:8",
  "D5:8 C5:2 B4:2 A4:2 B4:2",
  "C5:6 A4:2 A4:8",
  "C5:4 B4:2 A4:2 G4:4 C4:3 C4:1",
  "G4:8 A4:4 B4:4",
  "C5:16"
].join(" | ");

const ANTHEM_LEFT = [
  "r:2",
  "C3:8 E3:8",
  "F3:8 C3:8",
  "D3:8 F3:8",
  "D3:8 G3:8",
  "C3:8 E3:8",
  "F3:8 E3:8",
  "F3:8 C3:8",
  "D3:8 G3:8",
  "C3:8 E3:8",
  "G3:16",
  "F3:8 E3:8",
  "E3:16",
  "F3:16",
  "F3:16",
  "D3:8 G3:8",
  "C3:16",
  "D3:8 E3:8",
  "F3:16",
  "F3:8 C3:8",
  "G3:8 F3:4 G3:4",
  "C3:16"
].join(" | ");

/** Official edition: "Широко. Торжественно", half note = 76. */
const ANTHEM_TEMPO = 152;

export const EXERCISES: readonly Exercise[] = [
  {
    id: "five-finger-c",
    title: "Позиция до: пять пальцев",
    musicXml: scoreXml("Позиция до: пять пальцев", 72, FIVE_FINGER.right, FIVE_FINGER.left)
  },
  {
    id: "scale-c",
    title: "Гамма до мажор: подкладывание",
    musicXml: scoreXml("Гамма до мажор: подкладывание", 72, SCALE_C.right, SCALE_C.left)
  },
  {
    id: "anthem-ru",
    title: "Гимн России: мелодия и басы",
    musicXml: scoreXml("Гимн России: мелодия и басы", ANTHEM_TEMPO, ANTHEM_RIGHT, ANTHEM_LEFT)
  }
];
