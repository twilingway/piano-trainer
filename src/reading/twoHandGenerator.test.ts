// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  generateTwoHandExercise,
  nextTwoHandSeed,
  twoHandPairsForSeed,
  twoHandPromptXml
} from "./twoHandGenerator";
import { songFromMusicXml } from "../song/musicxml";
describe("two-hand generation", () => {
  it("keeps quotas and distinct neighboring pairs over many seeds", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const pairs = twoHandPairsForSeed(seed);
      expect(pairs).toHaveLength(10);
      for (const side of [0, 1])
        for (const pitch of side === 0 ? [48, 50, 52, 53, 55] : [60, 62, 64, 65, 67])
          expect(pairs.filter((pair) => pair.pitches[side] === pitch)).toHaveLength(2);
      expect(
        pairs.every(
          (pair, index) =>
            index === 0 ||
            JSON.stringify(pair.pitches) !== JSON.stringify(pairs[index - 1]?.pitches)
        )
      ).toBe(true);
      expect(twoHandPairsForSeed(seed)).toEqual(pairs);
      expect(twoHandPairsForSeed(nextTwoHandSeed(seed))).not.toEqual(pairs);
    }
  });
  it("parses two hands and ten simultaneous onset groups", () => {
    const exercise = generateTwoHandExercise(3);
    expect(exercise.song.notes).toHaveLength(20);
    expect(new Set(exercise.song.notes.map((note) => note.start)).size).toBe(10);
    expect(exercise.song.notes.filter((note) => note.hand === "left")).toHaveLength(10);
    expect(exercise.song.notes.filter((note) => note.hand === "right")).toHaveLength(10);
    expect(
      exercise.song.notes.filter((note) => note.hand === "left").every((note) => note.pitch < 60)
    ).toBe(true);
    expect(() => generateTwoHandExercise(1, 2)).toThrow();
  });
  it("projects only the current pair with both clefs and optional names", () => {
    const exercise = generateTwoHandExercise(3);
    const prompt = twoHandPromptXml(exercise, 6);
    const notes = songFromMusicXml(prompt.musicXml, "").notes;
    expect(notes.map((note) => note.pitch).toSorted()).toEqual(
      [...(exercise.pairs[6]?.pitches ?? [])].toSorted()
    );
    expect(notes.every((note) => note.start === 0)).toBe(true);
    expect(prompt.musicXml).toContain("<sign>F</sign>");
    expect(prompt.musicXml).toContain("<sign>G</sign>");
    expect(prompt.musicXml).not.toContain("lyric");
    expect(prompt.musicXml).not.toContain("fingering");
    expect(twoHandPromptXml(exercise, 6, 1).musicXml).toContain("lyric");
  });

  it("writes hinted names with the interface's label, letters by default", () => {
    const exercise = generateTwoHandExercise(17);
    const pair = exercise.pairs[0];
    if (!pair) throw new Error("pair expected");
    const letters = twoHandPromptXml(exercise, 0, 1).musicXml;
    const octave = (pitch: number) => String(Math.floor(pitch / 12) - 1);
    expect(letters).toMatch(new RegExp(`<text>[A-G]${octave(pair.pitches[1])}</text>`));
    const named = twoHandPromptXml(exercise, 0, 1, (pitch) => `нота ${String(pitch)} <&>`).musicXml;
    expect(named).toContain(`<text>нота ${String(pair.pitches[1])} &lt;&amp;&gt;</text>`);
    expect(named).toContain(`<text>нота ${String(pair.pitches[0])} &lt;&amp;&gt;</text>`);
  });
});
