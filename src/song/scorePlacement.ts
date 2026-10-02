import type { Song, SongNote } from "./song";

export type StaffClef = "bass" | "treble";

export interface ScorePlacement {
  readonly clef: StaffClef;
  /** Diatonic steps above the active staff's bottom line; ledger positions remain unfolded. */
  readonly position: number;
  readonly accidental: string;
}

interface Clef {
  readonly sign: string;
  readonly line: number;
  readonly octave: number;
}

const STEPS: Readonly<Record<string, number>> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SHARP_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const;
const SHARP_CLASSES = new Set([1, 3, 6, 8, 10]);
const ALTERATIONS: Readonly<Record<string, string>> = {
  "-2": "𝄫",
  "-1": "♭",
  "0": "",
  "1": "♯",
  "2": "𝄪"
};
const MARKS: Readonly<Record<string, string>> = {
  natural: "♮",
  sharp: "♯",
  flat: "♭",
  "double-sharp": "𝄪",
  "sharp-sharp": "𝄪",
  "flat-flat": "𝄫"
};

function text(element: Element, tag: string): string | undefined {
  return element.querySelector(`:scope > ${tag}`)?.textContent.trim();
}

function number(element: Element, tag: string, fallback: number): number {
  const value = text(element, tag);
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultClef(note: SongNote): StaffClef {
  return note.hand === "left" ? "bass" : "treble";
}

function bottom(clef: StaffClef): number {
  return clef === "bass" ? 2 * 7 + 4 : 4 * 7 + 2;
}

function midiPlacement(note: SongNote): ScorePlacement {
  const clef = defaultClef(note);
  const pitchClass = ((note.pitch % 12) + 12) % 12;
  const step = SHARP_STEPS[pitchClass] ?? 0;
  return {
    clef,
    position: (Math.floor(note.pitch / 12) - 1) * 7 + step - bottom(clef),
    accidental: SHARP_CLASSES.has(pitchClass) ? "♯" : ""
  };
}

function writtenPlacement(note: SongNote, element: Element, active?: Clef): ScorePlacement {
  const pitch = element.querySelector(":scope > pitch");
  if (!pitch) return midiPlacement(note);
  const step = STEPS[text(pitch, "step") ?? ""];
  const octave = number(pitch, "octave", Number.NaN);
  if (step === undefined || !Number.isFinite(octave)) return midiPlacement(note);
  const clef = active?.sign === "F" ? "bass" : active?.sign === "G" ? "treble" : defaultClef(note);
  const standard = active?.sign === "F" || active?.sign === "G";
  // G4/F3 are the reference pitches on the specified clef line.
  const base = standard
    ? (clef === "bass" ? 3 * 7 + 3 : 4 * 7 + 4) - 2 * (active.line - 1) + active.octave * 7
    : bottom(clef);
  const mark = text(element, "accidental");
  const alter = number(pitch, "alter", 0);
  return {
    clef,
    position: octave * 7 + step - base,
    accidental: (mark === undefined ? undefined : MARKS[mark]) ?? ALTERATIONS[String(alter)] ?? ""
  };
}

/** Resolve written notation once per song, independently of the hand assigned to play it. */
export function scorePlacements(song: Song): ReadonlyMap<string, ScorePlacement> {
  const result = new Map(song.notes.map((note) => [note.id, midiPlacement(note)]));
  if (!song.musicXml) return result;
  const document = new DOMParser().parseFromString(song.musicXml, "application/xml");
  if (document.querySelector("parsererror")) return result;
  const order = new Map(
    Array.from(document.querySelectorAll("note")).map((element, i) => [element, i])
  );
  const notes = new Map(
    song.notes.flatMap((note) =>
      note.sourceIndex === undefined ? [] : [[note.sourceIndex, note] as const]
    )
  );
  for (const part of Array.from(document.querySelectorAll("score-partwise > part"))) {
    const clefs = new Map<number, Clef>();
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      for (const element of Array.from(measure.children)) {
        if (element.tagName === "attributes") {
          for (const clef of Array.from(element.querySelectorAll(":scope > clef"))) {
            const sign = text(clef, "sign") ?? "";
            clefs.set(Number(clef.getAttribute("number") ?? 1), {
              sign,
              line: number(clef, "line", sign === "F" ? 4 : 2),
              octave: number(clef, "clef-octave-change", 0)
            });
          }
        } else if (element.tagName === "note") {
          const index = order.get(element);
          const note = index === undefined ? undefined : notes.get(index);
          if (note)
            result.set(
              note.id,
              writtenPlacement(note, element, clefs.get(number(element, "staff", 1)))
            );
        }
      }
    }
  }
  return result;
}
