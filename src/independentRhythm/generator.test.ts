// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { songFromMusicXml } from "../song/musicxml";
import { generateIndependentRhythmExercise, nextIndependentRhythmSeed } from "./generator";

describe("independent rhythm score source", () => {
  it("parses two pulse measures and four balanced two-hand measures", () => {
    for (let seed = 0; seed < 6; seed++) {
      const exercise = generateIndependentRhythmExercise(seed);
      expect(exercise.pulse.song.duration).toBe(8);
      expect(exercise.pulse.song.notes).toHaveLength(8);
      expect(
        exercise.pulse.song.notes.every(
          (note) => note.pitch === 60 && note.hand === "right" && note.duration === 1
        )
      ).toBe(true);
      expect(exercise.series.song.duration).toBe(16);
      expect(exercise.series.song.notes).toHaveLength(24);
      for (const hand of ["left", "right"])
        expect(exercise.series.song.notes.filter((note) => note.hand === hand)).toHaveLength(12);
      const groups = new Map<number, number>();
      for (const note of exercise.series.song.notes)
        groups.set(note.start, (groups.get(note.start) ?? 0) + 1);
      expect([...groups.values()].filter((size) => size === 2)).toHaveLength(8);
      expect([...groups.values()].filter((size) => size === 1)).toHaveLength(8);
      for (const phase of [exercise.pulse, exercise.series]) {
        const source = songFromMusicXml(phase.musicXml, "");
        const written = phase.song.notes.map(
          ({ finger: _finger, transition: _transition, ...note }) => note
        );
        expect(source.notes).toEqual(written);
        expect(phase.musicXml).not.toContain("<fingering>");
        expect(phase.musicXml).not.toContain("data-lesson-finger-cue");
        for (const note of phase.song.notes) expect(note.finger).toBe(note.hand === "left" ? 5 : 1);
      }
      expect(new Set(exercise.series.song.notes.map((note) => note.id)).size).toBe(24);
      expect(exercise.series.song.measures).toHaveLength(4);
      expect(exercise.series.song.beats.map((beat) => beat.time)).toEqual(
        Array.from({ length: 16 }, (_, index) => index)
      );
    }
  });
  it("reproduces six orders and changes the next order including wraparound", () => {
    expect(
      new Set(
        Array.from({ length: 6 }, (_, seed) =>
          generateIndependentRhythmExercise(seed).order.join("")
        )
      ).size
    ).toBe(6);
    for (const seed of [0, 1, 5, 6, 0xffffffff]) {
      expect(generateIndependentRhythmExercise(seed)).toEqual(
        generateIndependentRhythmExercise(seed)
      );
      expect(generateIndependentRhythmExercise(nextIndependentRhythmSeed(seed)).order).not.toEqual(
        generateIndependentRhythmExercise(seed).order
      );
    }
    expect(() => generateIndependentRhythmExercise(0, 2)).toThrow(RangeError);
  });
});
