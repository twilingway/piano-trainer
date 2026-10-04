import { describe, expect, it } from "vitest";

import {
  fifthsForKey,
  keyFromFifths,
  keyName,
  shiftBetween,
  transposeFifths,
  transposeKey,
  transposeWrittenPitch
} from "./keySignature";
import type { PitchStep, WrittenPitch } from "./keySignature";

const STEPS: readonly PitchStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_TONICS: readonly WrittenPitch[] = [
  { step: "C", alter: -1, octave: 4 },
  { step: "G", alter: -1, octave: 4 },
  { step: "D", alter: -1, octave: 4 },
  { step: "A", alter: -1, octave: 4 },
  { step: "E", alter: -1, octave: 4 },
  { step: "B", alter: -1, octave: 4 },
  { step: "F", alter: 0, octave: 4 },
  { step: "C", alter: 0, octave: 4 },
  { step: "G", alter: 0, octave: 4 },
  { step: "D", alter: 0, octave: 4 },
  { step: "A", alter: 0, octave: 4 },
  { step: "E", alter: 0, octave: 4 },
  { step: "B", alter: 0, octave: 4 },
  { step: "F", alter: 1, octave: 4 },
  { step: "C", alter: 1, octave: 4 }
];
const MINOR_TONICS: readonly WrittenPitch[] = [
  { step: "A", alter: -1, octave: 4 },
  { step: "E", alter: -1, octave: 4 },
  { step: "B", alter: -1, octave: 4 },
  { step: "F", alter: 0, octave: 4 },
  { step: "C", alter: 0, octave: 4 },
  { step: "G", alter: 0, octave: 4 },
  { step: "D", alter: 0, octave: 4 },
  { step: "A", alter: 0, octave: 4 },
  { step: "E", alter: 0, octave: 4 },
  { step: "B", alter: 0, octave: 4 },
  { step: "F", alter: 1, octave: 4 },
  { step: "C", alter: 1, octave: 4 },
  { step: "G", alter: 1, octave: 4 },
  { step: "D", alter: 1, octave: 4 },
  { step: "A", alter: 1, octave: 4 }
];

function midi(pitch: WrittenPitch): number {
  return (pitch.octave + 1) * 12 + (NATURALS[STEPS.indexOf(pitch.step)] ?? 0) + pitch.alter;
}

function scale(tonic: WrittenPitch, intervals: readonly number[]): WrittenPitch[] {
  const firstLetter = STEPS.indexOf(tonic.step);
  return intervals.map((interval, index) => {
    const position = firstLetter + index;
    const step = STEPS[position % 7] ?? "C";
    const octave = tonic.octave + Math.floor(position / 7);
    const natural = (octave + 1) * 12 + (NATURALS[position % 7] ?? 0);
    return { step, octave, alter: midi(tonic) + interval - natural };
  });
}

describe("key names and signature identity", () => {
  it.each([
    [
      "major",
      [
        "До",
        "Ре-бемоль",
        "Ре",
        "Ми-бемоль",
        "Ми",
        "Фа",
        "Фа-диез",
        "Соль",
        "Ля-бемоль",
        "Ля",
        "Си-бемоль",
        "Си"
      ]
    ],
    [
      "minor",
      [
        "До",
        "До-диез",
        "Ре",
        "Ре-диез",
        "Ми",
        "Фа",
        "Фа-диез",
        "Соль",
        "Соль-диез",
        "Ля",
        "Си-бемоль",
        "Си"
      ]
    ]
  ] as const)("names all 12 canonical %s keys consistently", (mode, names) => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const key = { tonic, mode };
      expect(keyName(key)).toBe(`${names[tonic] ?? ""} ${mode === "major" ? "мажор" : "минор"}`);
      expect(keyFromFifths(fifthsForKey(key), mode).tonic).toBe(tonic);
    }
  });

  it.each([
    [
      "major",
      [
        "До-бемоль",
        "Соль-бемоль",
        "Ре-бемоль",
        "Ля-бемоль",
        "Ми-бемоль",
        "Си-бемоль",
        "Фа",
        "До",
        "Соль",
        "Ре",
        "Ля",
        "Ми",
        "Си",
        "Фа-диез",
        "До-диез"
      ]
    ],
    [
      "minor",
      [
        "Ля-бемоль",
        "Ми-бемоль",
        "Си-бемоль",
        "Фа",
        "До",
        "Соль",
        "Ре",
        "Ля",
        "Ми",
        "Си",
        "Фа-диез",
        "До-диез",
        "Соль-диез",
        "Ре-диез",
        "Ля-диез"
      ]
    ]
  ] as const)("preserves all 15 authored %s signatures", (mode, names) => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      const key = keyFromFifths(fifths, mode);
      expect(keyName(key)).toBe(
        `${names[fifths + 7] ?? ""} ${mode === "major" ? "мажор" : "минор"}`
      );
      expect(fifthsForKey(key)).toBe(fifths);
      expect(transposeFifths(fifths, 0)).toBe(fifths);
      expect(transposeKey(key, 0)).toBe(key);
    }
  });

  it("normalizes every nonzero move and retains the mode and sounding tonic", () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (const mode of ["major", "minor"] as const) {
        const key = keyFromFifths(fifths, mode);
        for (let semitones = -11; semitones <= 11; semitones++) {
          if (semitones === 0) continue;
          const moved = transposeKey(key, semitones);
          expect(moved.fifths).toBeGreaterThanOrEqual(-5);
          expect(moved.fifths).toBeLessThanOrEqual(6);
          expect(moved.tonic).toBe((((key.tonic + semitones) % 12) + 12) % 12);
          expect(moved.mode).toBe(mode);
        }
      }
    }
  });

  it("prefers the ascending fifth for every tonic pair", () => {
    for (let from = 0; from < 12; from++) {
      for (let to = 0; to < 12; to++) {
        const shift = shiftBetween(from, to);
        expect(shift).toBeGreaterThanOrEqual(-4);
        expect(shift).toBeLessThanOrEqual(7);
        expect((((from + shift) % 12) + 12) % 12).toBe(to);
      }
    }
    expect(shiftBetween(0, 7)).toBe(7);
  });
});

describe("written transposition", () => {
  it("keeps all major, natural minor and harmonic minor scale degrees across every shift", () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (const [mode, tonics, intervals] of [
        ["major", MAJOR_TONICS, [0, 2, 4, 5, 7, 9, 11]],
        ["minor", MINOR_TONICS, [0, 2, 3, 5, 7, 8, 10]],
        ["minor", MINOR_TONICS, [0, 2, 3, 5, 7, 8, 11]]
      ] as const) {
        const tonic = tonics[fifths + 7];
        if (!tonic) throw new Error("missing test tonic");
        const original = scale(tonic, intervals);
        for (let shift = -11; shift <= 11; shift++) {
          const targetFifths = transposeFifths(fifths, shift);
          const targetTonic = tonics[targetFifths + 7];
          if (!targetTonic) throw new Error("missing target tonic");
          const octaveDelta = (midi(tonic) + shift - midi(targetTonic)) / 12;
          const expected = scale(
            { ...targetTonic, octave: targetTonic.octave + octaveDelta },
            intervals
          );
          const moved = original.map((pitch) => transposeWrittenPitch(pitch, fifths, shift));
          expect(
            moved,
            `${mode} fifths=${String(fifths)} shift=${String(shift)} intervals=${intervals.join(",")}`
          ).toEqual(expected);
          moved.forEach((pitch, index) => {
            const source = original[index];
            if (!source) throw new Error("missing source pitch");
            expect(midi(pitch)).toBe(midi(source) + shift);
          });
        }
      }
    }
  });

  it("preserves exact MIDI for every letter, octave boundary and chromatic alteration", () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (let shift = -11; shift <= 11; shift++) {
        for (const step of STEPS) {
          for (const octave of [3, 4, 5]) {
            for (const alter of [-2, -1, 0, 1, 2]) {
              const pitch = { step, octave, alter };
              const moved = transposeWrittenPitch(pitch, fifths, shift);
              expect(midi(moved)).toBe(midi(pitch) + shift);
              expect(Number.isInteger(moved.octave)).toBe(true);
              expect(Number.isInteger(moved.alter)).toBe(true);
              if (shift === 0) expect(moved).toBe(pitch);
            }
          }
        }
      }
    }
  });

  it("spells the raised seventh of F-sharp minor as E-sharp", () => {
    expect(transposeWrittenPitch({ step: "G", alter: 1, octave: 4 }, 0, -3)).toEqual({
      step: "E",
      alter: 1,
      octave: 4
    });
  });

  it("carries B-sharp and C-flat over their written octave boundaries", () => {
    expect(transposeWrittenPitch({ step: "B", alter: 1, octave: 4 }, 7, 1)).toEqual({
      step: "C",
      alter: 1,
      octave: 5
    });
    expect(transposeWrittenPitch({ step: "C", alter: -1, octave: 4 }, -7, -1)).toEqual({
      step: "B",
      alter: -1,
      octave: 3
    });
    expect(transposeWrittenPitch({ step: "G", alter: 1, octave: 4 }, 0, 4)).toEqual({
      step: "B",
      alter: 1,
      octave: 4
    });
  });
});
