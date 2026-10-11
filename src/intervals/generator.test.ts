// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  classifyInterval,
  generateIntervalExercise,
  INTERVAL_PITCHES,
  nextIntervalSeed
} from "./generator";
import { intervalPromptXml } from "./prompt";
import { INTERVAL_CATEGORIES } from "./types";
import { songFromMusicXml } from "../song/musicxml";

describe("interval source generation", () => {
  it("balances directed categories and produces exactly twenty source notes", () => {
    for (const seed of [0, 1, 42, 999, 0xffffffff]) {
      const exercise = generateIntervalExercise("see-and-play", seed);
      expect(exercise.pairs).toHaveLength(10);
      expect(exercise.song.notes).toHaveLength(20);
      expect(exercise.song.duration).toBe(10);
      for (const category of INTERVAL_CATEGORIES)
        expect(exercise.pairs.filter((pair) => pair.category === category)).toHaveLength(2);
      for (const pair of exercise.pairs) {
        expect(classifyInterval(pair.anchorMidi, pair.targetMidi)).toBe(pair.category);
        expect(INTERVAL_PITCHES).toContain(pair.anchorMidi);
        expect(INTERVAL_PITCHES).toContain(pair.targetMidi);
        const notes = exercise.song.notes.slice(pair.index * 2, pair.index * 2 + 2);
        expect(notes.map((note) => note.pitch)).toEqual([pair.anchorMidi, pair.targetMidi]);
        expect(notes.map((note) => note.id)).toEqual(pair.noteIds);
        expect(notes.every((note) => note.hand === "right" && note.duration === 0.5)).toBe(true);
      }
    }
  });
  it("uses diatonic rather than semitone differences", () => {
    expect(classifyInterval(64, 65)).toBe("step-up");
    expect(classifyInterval(62, 65)).toBe("third-up");
    expect(classifyInterval(65, 62)).toBe("third-down");
    expect(classifyInterval(65, 64)).toBe("step-down");
    expect(classifyInterval(67, 67)).toBe("repeat");
    expect(() => classifyInterval(60, 65)).toThrow(RangeError);
    expect(() => classifyInterval(61, 62)).toThrow(RangeError);
  });
  it("reproduces identity, XML, pairs and source song for explicit inputs", () => {
    const a = generateIntervalExercise("hear-and-choose", 42, 1);
    expect(generateIntervalExercise("hear-and-choose", 42, 1)).toEqual(a);
    const changed = generateIntervalExercise(a.mode, nextIntervalSeed(a.seed));
    expect(changed.pairs.map((pair) => [pair.anchorMidi, pair.targetMidi])).not.toEqual(
      a.pairs.map((pair) => [pair.anchorMidi, pair.targetMidi])
    );
    expect(generateIntervalExercise("see-and-play", 42).id).not.toBe(a.id);
    expect(() => generateIntervalExercise(a.mode, NaN)).toThrow(RangeError);
    expect(() => generateIntervalExercise(a.mode, 42, 2)).toThrow(RangeError);
  });
  it("shows both current notes with original source IDs and current-note cursor beat", () => {
    const exercise = generateIntervalExercise("see-and-play", 42);
    for (let index = 0; index < 10; index++) {
      const first = intervalPromptXml(exercise.musicXml, index, 0);
      const second = intervalPromptXml(exercise.musicXml, index, 1);
      expect(first.musicXml).toBe(second.musicXml);
      expect(first.beat).toBe(0);
      expect(second.beat).toBe(1);
      const promptSong = songFromMusicXml(first.musicXml, "");
      const document = new DOMParser().parseFromString(first.musicXml, "application/xml");
      expect([...document.querySelectorAll("note")].map((note) => note.id)).toEqual(
        exercise.pairs[index]?.noteIds
      );
      expect(promptSong.notes).toHaveLength(2);
      expect(first.musicXml).toContain("<clef>");
      expect(first.musicXml).not.toContain("fingering");
    }
    expect(() => intervalPromptXml(exercise.musicXml, 10)).toThrow(RangeError);
    expect(() => intervalPromptXml("<invalid>", 0)).toThrow();
  });
});
