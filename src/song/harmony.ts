import { quartersAt } from "./song";
import type { Song } from "./song";

/*
 * Chords and key, read off the notes. A chord is the triad or seventh whose
 * tones cover most of what sounds in a stretch of the music; the key is the
 * one whose Krumhansl-Kessler profile best matches the song's pitch classes.
 */

export type ChordKind =
  "major" | "minor" | "diminished" | "augmented" | "dominant" | "minor-seventh" | "major-seventh";

export interface Chord {
  /** Quarter notes from the start of the song. */
  readonly beat: number;
  /** Pitch class of the root, 0 = C. */
  readonly root: number;
  readonly kind: ChordKind;
}

const SHAPES: readonly (readonly [ChordKind, readonly number[]])[] = [
  ["major", [0, 4, 7]],
  ["minor", [0, 3, 7]],
  ["dominant", [0, 4, 7, 10]],
  ["minor-seventh", [0, 3, 7, 10]],
  ["major-seventh", [0, 4, 7, 11]],
  ["diminished", [0, 3, 6]],
  ["augmented", [0, 4, 8]]
];

/** Of what sounds, at least this share must belong to the chord for it to be named. */
const MIN_COVER = 0.6;
/** Sevenths must earn their extra note: a triad wins unless the seventh really sounds. */
const SEVENTH_PENALTY = 0.08;
/** A root in the bass is how a listener hears it. */
const BASS_ROOT_BONUS = 0.1;

interface Window {
  readonly start: number;
  readonly end: number;
}

/** Half a measure in duple and quadruple time, the whole measure otherwise. */
function windows(song: Song): Window[] {
  const result: Window[] = [];
  for (const measure of song.measures) {
    const halves = measure.beats % 2 === 0 && measure.length >= 2 ? 2 : 1;
    const size = measure.length / halves;
    for (let index = 0; index < halves; index++) {
      result.push({ start: measure.start + index * size, end: measure.start + (index + 1) * size });
    }
  }
  return result;
}

function chordIn(song: Song, window: Window): Chord | undefined {
  const weights = new Array<number>(12).fill(0);
  let bass: number | undefined;
  let bassStart = Number.POSITIVE_INFINITY;
  for (const note of song.notes) {
    const start = note.startBeat;
    const end = start + quartersAt(song, note.start + note.duration) - quartersAt(song, note.start);
    const overlap = Math.min(end, window.end) - Math.max(start, window.start);
    if (overlap <= 0) continue;
    weights[note.pitch % 12] = (weights[note.pitch % 12] ?? 0) + overlap;
    if (bass === undefined || note.pitch < bass || (note.pitch === bass && start < bassStart)) {
      bass = note.pitch;
      bassStart = start;
    }
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  // One pitch alone (an upbeat, a melody note) is not a chord.
  if (weights.filter((value) => value > 0).length < 2) return undefined;
  let best: { root: number; kind: ChordKind; score: number } | undefined;
  for (let root = 0; root < 12; root++) {
    for (const [kind, intervals] of SHAPES) {
      const tones = intervals.map((interval) => (root + interval) % 12);
      const cover = tones.reduce((sum, tone) => sum + (weights[tone] ?? 0), 0) / total;
      // Every tone of the chord should be there; a missing one costs.
      const missing = tones.filter((tone) => (weights[tone] ?? 0) === 0).length;
      const score =
        cover -
        missing * 0.2 -
        (intervals.length > 3 ? SEVENTH_PENALTY : 0) +
        (bass !== undefined && bass % 12 === root ? BASS_ROOT_BONUS : 0);
      if (cover >= MIN_COVER && (!best || score > best.score)) best = { root, kind, score };
    }
  }
  return best ? { beat: window.start, root: best.root, kind: best.kind } : undefined;
}

/** One chord per half measure (per measure in odd meters), repeats dropped. */
export function detectChords(song: Song): Chord[] {
  const chords: Chord[] = [];
  for (const window of windows(song)) {
    const chord = chordIn(song, window);
    const previous = chords.at(-1);
    if (!chord) continue;
    if (previous?.root === chord.root && previous.kind === chord.kind) continue;
    chords.push(chord);
  }
  return chords;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface Key {
  readonly tonic: number;
  readonly mode: "major" | "minor";
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const ma = mean(a);
  const mb = mean(b);
  let top = 0;
  let da = 0;
  let db = 0;
  a.forEach((value, index) => {
    const other = b[index] ?? 0;
    top += (value - ma) * (other - mb);
    da += (value - ma) ** 2;
    db += (other - mb) ** 2;
  });
  return da === 0 || db === 0 ? 0 : top / Math.sqrt(da * db);
}

/** The key whose profile best matches how long each pitch class sounds in the song. */
export function detectKey(song: Song): Key | undefined {
  const weights = new Array<number>(12).fill(0);
  for (const note of song.notes)
    weights[note.pitch % 12] = (weights[note.pitch % 12] ?? 0) + note.duration;
  if (weights.every((value) => value === 0)) return undefined;
  let best: (Key & { score: number }) | undefined;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [
      ["major", MAJOR_PROFILE],
      ["minor", MINOR_PROFILE]
    ] as const) {
      const rotated = profile.map((_, index) => profile[(index - tonic + 12) % 12] ?? 0);
      const score = correlation(weights, rotated);
      if (!best || score > best.score) best = { tonic, mode, score };
    }
  }
  return best ? { tonic: best.tonic, mode: best.mode } : undefined;
}

const TONIC_NAMES = [
  "до",
  "до-диез",
  "ре",
  "ми-бемоль",
  "ми",
  "фа",
  "фа-диез",
  "соль",
  "ля-бемоль",
  "ля",
  "си-бемоль",
  "си"
];

/** "До мажор", "ля минор". */
export function keyName(key: Key): string {
  const tonic = TONIC_NAMES[key.tonic] ?? "";
  const name = `${tonic} ${key.mode === "major" ? "мажор" : "минор"}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Root spellings as chord symbols usually have them: flats for Eb, Ab, Bb, sharps for C#, F#. */
const ROOT_SPELLING: readonly (readonly [string, number])[] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0]
];

/**
 * The score with a chord symbol over the first note of each chord's stretch.
 * Positions are walked the way the reader walks them: divisions, backups,
 * forwards, and chord notes that do not move time on.
 */
export function musicXmlWithChords(xml: string, chords: readonly Chord[]): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const part = document.querySelector("part");
  if (!part) return xml;
  const firstAt = new Map<string, Element>();
  let divisions = 1;
  let measureStart = 0;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    let position = 0;
    let measureLength = 0;
    let lastStart = 0;
    for (const element of Array.from(measure.children)) {
      const duration = Number(element.querySelector(":scope > duration")?.textContent ?? 0);
      if (element.tagName === "attributes") {
        divisions = Number(element.querySelector(":scope > divisions")?.textContent ?? divisions);
      } else if (element.tagName === "backup") {
        position -= duration;
      } else if (element.tagName === "forward") {
        position += duration;
      } else if (element.tagName === "note" && !element.querySelector(":scope > grace")) {
        const isChord = element.querySelector(":scope > chord") !== null;
        const start = isChord ? lastStart : position;
        if (!isChord) {
          lastStart = position;
          position += duration;
        }
        const key = String(Math.round((measureStart + start / divisions) * 1000) / 1000);
        if (!isChord && !firstAt.has(key)) firstAt.set(key, element);
      }
      measureLength = Math.max(measureLength, position);
    }
    measureStart += measureLength / divisions;
  }
  for (const chord of chords) {
    const target = firstAt.get(String(Math.round(chord.beat * 1000) / 1000));
    if (!target) continue;
    const [step, alter] = ROOT_SPELLING[chord.root] ?? ["C", 0];
    const harmony = document.createElement("harmony");
    const root = document.createElement("root");
    const rootStep = document.createElement("root-step");
    rootStep.textContent = step;
    root.appendChild(rootStep);
    if (alter !== 0) {
      const rootAlter = document.createElement("root-alter");
      rootAlter.textContent = String(alter);
      root.appendChild(rootAlter);
    }
    const kind = document.createElement("kind");
    kind.textContent = chord.kind;
    harmony.append(root, kind);
    target.parentElement?.insertBefore(harmony, target);
  }
  return new XMLSerializer().serializeToString(document);
}
