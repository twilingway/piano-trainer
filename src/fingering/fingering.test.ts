import { describe, expect, it } from "vitest";

import { assignFingering } from "./fingering";
import type { Finger, FingeringNote, Hand } from "./fingering";

const NAMES: Readonly<Record<string, number>> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

/** "C4" -> 60. */
function pitch(name: string): number {
  const match = /^([A-G][#b]?)(-?\d)$/.exec(name);
  const pitchClass = match?.[1] ? NAMES[match[1]] : undefined;
  if (!match?.[2] || pitchClass === undefined) throw new Error(`Bad note ${name}`);
  return (Number(match[2]) + 1) * 12 + pitchClass;
}

function melody(names: readonly string[]): FingeringNote[] {
  return names.map((name, index) => ({
    id: `n${String(index)}`,
    pitch: pitch(name),
    start: index * 0.5
  }));
}

function fingersOf(
  notes: readonly FingeringNote[],
  hand: Hand,
  fixed?: ReadonlyMap<string, Finger>
) {
  const result = assignFingering(notes, hand, fixed);
  return notes.map((note) => result.get(note.id)?.finger);
}

const C_MAJOR_UP = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const C_MAJOR_UP_LOW = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"];

describe("assignFingering: scales", () => {
  it("right hand, C major up, passes the thumb under after the third finger", () => {
    expect(fingersOf(melody(C_MAJOR_UP), "right")).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it("right hand, C major down, crosses the third finger over the thumb", () => {
    expect(fingersOf(melody([...C_MAJOR_UP].reverse()), "right")).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it("left hand, C major up, crosses the third finger over the thumb", () => {
    expect(fingersOf(melody(C_MAJOR_UP_LOW), "left")).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it("left hand, C major down, passes the thumb under after the third finger", () => {
    expect(fingersOf(melody([...C_MAJOR_UP_LOW].reverse()), "left")).toEqual([
      1, 2, 3, 1, 2, 3, 4, 5
    ]);
  });

  it("right hand, C major over two octaves, alternates the third and the fourth finger", () => {
    const scale = [...C_MAJOR_UP.slice(0, -1), "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
    expect(fingersOf(melody(scale), "right")).toEqual([
      1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5
    ]);
  });

  it("right hand, G major up, keeps F sharp on the fourth finger", () => {
    const scale = ["G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5"];
    expect(fingersOf(melody(scale), "right")).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it("right hand, F major up, keeps the thumb off B flat", () => {
    const scale = ["F4", "G4", "A4", "Bb4", "C5", "D5", "E5", "F5"];
    expect(fingersOf(melody(scale), "right")).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
});

describe("assignFingering: positions", () => {
  it("plays a five-finger position without moving the hand", () => {
    const notes = melody(["C4", "D4", "E4", "F4", "G4", "F4", "E4", "D4", "C4"]);
    expect(fingersOf(notes, "right")).toEqual([1, 2, 3, 4, 5, 4, 3, 2, 1]);
    expect(fingersOf(melody(["C3", "D3", "E3", "F3", "G3"]), "left")).toEqual([5, 4, 3, 2, 1]);
  });

  it("labels how the hand moves", () => {
    const result = assignFingering(melody(C_MAJOR_UP), "right");
    expect(result.get("n0")?.transition).toBeUndefined();
    expect(result.get("n1")?.transition).toBe("position");
    expect(result.get("n3")?.transition).toBe("thumbUnder");
    const down = assignFingering(melody([...C_MAJOR_UP].reverse()), "right");
    expect(down.get("n5")?.transition).toBe("crossOver");
  });
});

describe("assignFingering: chords", () => {
  it("fingers a root-position triad 1-3-5 in the right hand and 5-3-1 in the left", () => {
    const triad = (octave: number): FingeringNote[] =>
      ["C", "E", "G"].map((name, index) => ({
        id: `t${String(index)}`,
        pitch: pitch(`${name}${String(octave)}`),
        start: 0
      }));
    expect(fingersOf(triad(4), "right")).toEqual([1, 3, 5]);
    expect(fingersOf(triad(3), "left")).toEqual([5, 3, 1]);
  });

  it("fingers the inversions of a triad as taught", () => {
    const chord = (names: readonly string[]): FingeringNote[] =>
      names.map((name, index) => ({ id: `i${String(index)}`, pitch: pitch(name), start: 0 }));
    // First inversion E-G-C, second inversion G-C-E.
    expect(fingersOf(chord(["E4", "G4", "C5"]), "right")).toEqual([1, 2, 5]);
    expect(fingersOf(chord(["G4", "C5", "E5"]), "right")).toEqual([1, 3, 5]);
    expect(fingersOf(chord(["E3", "G3", "C4"]), "left")).toEqual([5, 3, 1]);
    expect(fingersOf(chord(["G3", "C4", "E4"]), "left")).toEqual([5, 2, 1]);
  });
});

describe("assignFingering: pinned fingers", () => {
  it("solves the rest of the phrase around a pinned finger", () => {
    const notes = melody(["C4", "D4", "E4", "F4", "G4"]);
    const fixed = new Map<string, Finger>([["n0", 2]]);
    const fingers = fingersOf(notes, "right", fixed);
    expect(fingers[0]).toBe(2);
    expect(fingers.every((finger) => finger !== undefined)).toBe(true);
  });
});
