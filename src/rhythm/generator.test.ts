// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { songFromMusicXml } from "../song/musicxml";
import { generateRhythmExercise } from "./generator";
import { RHYTHM_BPMS } from "./types";

describe("rhythm score generation", () => {
  it("keeps all quotas and full measure duration across seeds and tempos", () => {
    for (const seed of [0, 1, 42, 999, 0xffffffff]) {
      for (const bpm of RHYTHM_BPMS) {
        const exercise = generateRhythmExercise(seed, bpm);
        const document = new DOMParser().parseFromString(exercise.musicXml, "application/xml");
        const measures = [...document.querySelectorAll("part > measure")];
        expect(measures).toHaveLength(4);
        expect(document.querySelectorAll("note > rest")).toHaveLength(4);
        expect(exercise.song.notes).toHaveLength(10);
        expect(
          exercise.song.notes.filter((note) => Math.abs(note.duration - 60 / bpm) < 1e-9)
        ).toHaveLength(8);
        expect(
          exercise.song.notes.filter((note) => Math.abs(note.duration - 120 / bpm) < 1e-9)
        ).toHaveLength(2);
        expect(
          exercise.song.notes.every((note) => note.pitch === 60 && note.hand === "right")
        ).toBe(true);
        expect(exercise.durationS).toBeCloseTo((16 * 60) / bpm);
        expect(exercise.song.duration).toBe(exercise.durationS);
        expect(exercise.song.beats).toHaveLength(16);
        expect(exercise.onsets).toEqual(
          exercise.song.notes.map((note) => ({ id: note.id, timeS: note.start }))
        );
        expect(exercise.rests).toHaveLength(4);
        expect(
          exercise.rests.reduce((total, rest) => total + rest.endS - rest.startS, 0)
        ).toBeCloseTo((4 * 60) / bpm);
        for (const measure of measures) {
          expect(
            [...measure.querySelectorAll("note > duration")].reduce(
              (total, element) => total + Number(element.textContent),
              0
            )
          ).toBe(4);
          expect(measure.querySelector("note:first-of-type > pitch")).not.toBeNull();
        }
      }
    }
  });

  it("shuffles whole approved bars only and reproduces the source song", () => {
    const expected = ["QQQQ", "HQR", "QHR", "QRQR"].sort();
    const signatures = new Set<string>();
    for (let seed = 0; seed < 16; seed++) {
      const exercise = generateRhythmExercise(seed, 80);
      const document = new DOMParser().parseFromString(exercise.musicXml, "application/xml");
      const bars = [...document.querySelectorAll("part > measure")].map((measure) =>
        [...measure.querySelectorAll("note")]
          .map((note) =>
            note.querySelector("rest")
              ? "R"
              : note.querySelector("type")?.textContent === "half"
                ? "H"
                : "Q"
          )
          .join("")
      );
      expect([...bars].sort()).toEqual(expected);
      signatures.add(bars.join("/"));
      const parsed = songFromMusicXml(exercise.musicXml, "");
      expect(exercise.song.notes).toEqual(parsed.notes);
      expect(exercise.song.measures).toEqual(parsed.measures);
      expect(generateRhythmExercise(seed, 80, 1)).toEqual(exercise);
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("includes trailing rests instead of stopping at the last note", () => {
    const exercise = Array.from({ length: 16 }, (_, seed) => generateRhythmExercise(seed)).find(
      (candidate) => candidate.rests.at(-1)?.endS === candidate.durationS
    );
    expect(exercise).toBeDefined();
    if (!exercise) throw new Error("No trailing-rest test fixture");
    const parsed = songFromMusicXml(exercise.musicXml, "");
    expect(parsed.duration).toBeLessThan(exercise.durationS);
    expect(exercise.durationS).toBe(16);
    expect(exercise.song.duration).toBe(16);
  });

  it("rejects unsupported versions, nonfinite seeds and other tempos", () => {
    expect(() => generateRhythmExercise(NaN)).toThrow(RangeError);
    expect(() => generateRhythmExercise(1, 60, 2)).toThrow(RangeError);
    expect(() => generateRhythmExercise(1, 120 as 60)).toThrow(RangeError);
    expect(generateRhythmExercise(-1).seed).toBe(0xffffffff);
  });
});
