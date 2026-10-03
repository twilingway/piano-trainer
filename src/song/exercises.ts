/*
 * Built-in lessons, written out as MusicXML so they get a staff like any
 * loaded score. Each hand is a line of "note:length" tokens, where the length
 * counts sixteenths ("C4:4" is a quarter C4, "r:2" an eighth rest,
 * "C3+E3+G3:8" a half-note chord) and "|" ends a measure.
 */

/** A level's id within its lesson: "easy", "medium", "hard" for the built-in ones, a file name for local ones. */
export type LevelId = string;

export interface ExerciseLevel {
  readonly id: LevelId;
  /** What changes at this level, shown in the level picker. */
  readonly title: string;
  readonly musicXml: string;
}

export interface Exercise {
  readonly id: string;
  readonly title: string;
  /** Easiest first. */
  readonly levels: readonly ExerciseLevel[];
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
  /** MIDI pitches struck together; empty for a rest. */
  readonly pitches: readonly number[];
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
        return {
          pitches: name === "r" ? [] : name.split("+").map(parsePitch),
          sixteenths: Number(length)
        };
      })
  );
}

function noteXml(token: Token, staff: 1 | 2): string {
  const [type, dotted] = NOTE_TYPES[token.sixteenths] ?? ["quarter", false];
  const voice = staff === 1 ? 1 : 5;
  const tail =
    `<duration>${String(token.sixteenths)}</duration><voice>${String(voice)}</voice>` +
    `<type>${type}</type>${dotted ? "<dot/>" : ""}<staff>${String(staff)}</staff>`;
  if (token.pitches.length === 0) return `<note><rest/>${tail}</note>`;
  return token.pitches
    .map((pitch, index) => {
      const [step, alter] = SPELLING[pitch % 12] ?? ["C", 0];
      const octave = Math.floor(pitch / 12) - 1;
      const alterXml = alter === 0 ? "" : `<alter>${String(alter)}</alter>`;
      const chord = index === 0 ? "" : "<chord/>";
      return `<note>${chord}<pitch><step>${step}</step>${alterXml}<octave>${String(octave)}</octave></pitch>${tail}</note>`;
    })
    .join("");
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

/** Both hands on the same line an octave apart, `sixteenths` long each, in 4/4. */
function unisonLine(names: readonly string[], sixteenths: number): { right: string; left: string } {
  const lower = (name: string) => name.replace(/\d$/, (octave) => String(Number(octave) - 1));
  const perMeasure = 16 / sixteenths;
  const measures = (transform: (name: string) => string) => {
    const tokens = names.map((name) => `${transform(name)}:${String(sixteenths)}`);
    while (tokens.length % perMeasure !== 0) tokens.push(`r:${String(sixteenths)}`);
    const bars: string[] = [];
    for (let index = 0; index < tokens.length; index += perMeasure) {
      bars.push(tokens.slice(index, index + perMeasure).join(" "));
    }
    return bars.join(" | ");
  };
  return { right: measures((name) => name), left: measures(lower) };
}

/** Slow quarters, quarters at tempo, eighths at tempo: the same line, only faster. */
function drillLevels(title: string, names: readonly string[]): ExerciseLevel[] {
  const quarters = unisonLine(names, 4);
  const eighths = unisonLine(names, 2);
  return [
    {
      id: "easy",
      title: "Лёгкий — медленно",
      musicXml: scoreXml(title, 60, quarters.right, quarters.left)
    },
    {
      id: "medium",
      title: "Средний — в темпе",
      musicXml: scoreXml(title, 88, quarters.right, quarters.left)
    },
    {
      id: "hard",
      title: "Сложный — восьмыми",
      musicXml: scoreXml(title, 88, eighths.right, eighths.left)
    }
  ];
}

const FIVE_FINGER = ["C4", "D4", "E4", "F4", "G4", "F4", "E4", "D4", "C4"];
const SCALE_C = "C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4".split(" ");

/*
 * State Anthem of the Russian Federation, music by A. V. Alexandrov: one verse
 * and the chorus with the final ending. The melody follows the official 2001
 * edition (Muzyka); where the voice line splits, the upper voice is the tune.
 * The left hand is written per level from the harmony of the accompaniment
 * (ANTHEM_HARMONY below): its root, the root in octaves, or close chords.
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

/*
 * The harmony under the melody, per half measure, as the full accompaniment
 * voices it. Seventh chords keep root, third and seventh: three fingers of
 * the left hand, and the fifth is the note a pianist drops first.
 */
const ANTHEM_HARMONY = [
  "r:2",
  "C:8 Em:8",
  "F:8 C:8",
  "Dm:8 F:8",
  "D:8 G7:8",
  "C:8 Em:8",
  "F:8 Em:8",
  "F:8 C:8",
  "D:8 G7:8",
  "C:8 Em:8",
  "G7:16",
  "F:8 Em:8",
  "Em:16",
  "F:16",
  "F:16",
  "Dm7:8 G7:8",
  "C:16",
  "Dm:8 E7:8",
  "F:16",
  "F:8 C:8",
  "G7:8 F:4 G7:4",
  "C:16"
].join(" | ");

/** Pitch classes, root first. */
const CHORDS: Readonly<Record<string, readonly number[]>> = {
  C: [0, 4, 7],
  Dm: [2, 5, 9],
  D: [2, 6, 9],
  Em: [4, 7, 11],
  F: [5, 9, 0],
  G7: [7, 11, 5],
  E7: [4, 8, 2],
  Dm7: [2, 5, 0]
};

/** The octave from C3: where a teaching bass sits without crowding the melody. */
const BASS_LOW = 48;
/** Chords stay between G2 and B3. */
const CHORD_LOW = 43;
const CHORD_HIGH = 59;

function chordTones(symbol: string): readonly number[] {
  const tones = CHORDS[symbol];
  if (!tones) throw new Error(`Unknown chord ${symbol}`);
  return tones;
}

function pitchName(pitch: number): string {
  const [step, alter] = SPELLING[pitch % 12] ?? ["C", 0];
  return `${step}${alter === 0 ? "" : "#"}${String(Math.floor(pitch / 12) - 1)}`;
}

/** Every close voicing of a triad inside the chord range, lowest note first. */
function voicings(tones: readonly number[]): number[][] {
  const result: number[][] = [];
  for (let rotation = 0; rotation < tones.length; rotation++) {
    const order = [...tones.slice(rotation), ...tones.slice(0, rotation)];
    for (let base = CHORD_LOW; base < CHORD_LOW + 12; base++) {
      if (base % 12 !== order[0]) continue;
      const pitches = [base];
      for (const tone of order.slice(1)) {
        let next = (pitches.at(-1) ?? base) + 1;
        while (next % 12 !== tone) next++;
        pitches.push(next);
      }
      if ((pitches.at(-1) ?? 0) <= CHORD_HIGH) result.push(pitches);
    }
  }
  return result;
}

/**
 * Rewrites a harmony line for the left hand: each chord symbol becomes its
 * root, the root in octaves, or the voicing nearest to the previous chord,
 * so the hand moves as little as the harmony allows.
 */
function leftHand(harmony: string, style: "root" | "octave" | "chord"): string {
  let previous: readonly number[] = [48, 52, 55];
  const distance = (pitches: readonly number[]) =>
    pitches.reduce((sum, pitch, index) => sum + Math.abs(pitch - (previous[index] ?? pitch)), 0);
  return harmony
    .split("|")
    .map((measure) =>
      measure
        .trim()
        .split(/\s+/)
        .map((token) => {
          const [symbol = "", length = ""] = token.split(":");
          if (symbol === "r") return token;
          const tones = chordTones(symbol);
          const root = BASS_LOW + (tones[0] ?? 0);
          if (style === "root") return `${pitchName(root)}:${length}`;
          if (style === "octave") return `${pitchName(root - 12)}+${pitchName(root)}:${length}`;
          const best = voicings(tones).sort((a, b) => distance(a) - distance(b))[0] ?? [root];
          previous = best;
          return `${best.map(pitchName).join("+")}:${length}`;
        })
        .join(" ")
    )
    .join(" | ");
}

/**
 * Official 2001 edition: "Широко. Торжественно", quarter note = 76.
 * https://commons.wikimedia.org/wiki/File:Hymn_of_Russia_sheet_music_2001.png
 */
const ANTHEM_TEMPO = 76;

const ANTHEM_TITLE = "Гимн России";

function anthemLevel(
  id: LevelId,
  title: string,
  style: "root" | "octave" | "chord"
): ExerciseLevel {
  const left = leftHand(ANTHEM_HARMONY, style);
  return { id, title, musicXml: scoreXml(ANTHEM_TITLE, ANTHEM_TEMPO, ANTHEM_RIGHT, left) };
}

export const EXERCISES: readonly Exercise[] = [
  {
    id: "five-finger-c",
    title: "Позиция до: пять пальцев",
    levels: drillLevels("Позиция до: пять пальцев", FIVE_FINGER)
  },
  {
    id: "scale-c",
    title: "Гамма до мажор: подкладывание",
    levels: drillLevels("Гамма до мажор: подкладывание", SCALE_C)
  },
  {
    id: "anthem-ru",
    title: ANTHEM_TITLE,
    levels: [
      anthemLevel("easy", "Лёгкий — бас одной нотой", "root"),
      anthemLevel("medium", "Средний — бас октавами", "octave"),
      anthemLevel("hard", "Сложный — аккорды", "chord")
    ]
  }
];
