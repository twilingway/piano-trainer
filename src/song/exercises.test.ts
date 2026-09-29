// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import { songFromMusicXml } from "./musicxml";
import { withFingering } from "./song";

describe("built-in exercises", () => {
  it("fingers the C major scale the way a teacher would, in both hands", () => {
    const exercise = EXERCISES.find((item) => item.id === "scale-c");
    if (!exercise) throw new Error("missing exercise");
    const song = withFingering(songFromMusicXml(exercise.musicXml, exercise.title));
    const fingers = (hand: "right" | "left") =>
      song.notes.filter((note) => note.hand === hand).map((note) => note.finger);
    expect(fingers("right")).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
    expect(fingers("left")).toEqual([5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it("parses every exercise into both hands", () => {
    for (const exercise of EXERCISES) {
      const song = songFromMusicXml(exercise.musicXml, exercise.title);
      expect(song.title).toBe(exercise.title);
      expect(song.notes.some((note) => note.hand === "left")).toBe(true);
      expect(song.notes.some((note) => note.hand === "right")).toBe(true);
    }
  });

  it("writes the anthem as a pickup, a verse and the chorus with its final ending", () => {
    const exercise = EXERCISES.find((item) => item.id === "anthem-ru");
    if (!exercise) throw new Error("missing anthem");
    const song = withFingering(songFromMusicXml(exercise.musicXml, exercise.title));
    const right = song.notes.filter((note) => note.hand === "right");
    // G4 upbeat, then "Рос-си-я — свя-щен-на-я" on C5 G4 A4 B4 E4 E4.
    expect(right.slice(0, 7).map((note) => note.pitch)).toEqual([67, 72, 67, 69, 71, 64, 64]);
    expect(right[1]?.startBeat).toBe(0.5);
    expect(right.at(-1)).toMatchObject({ pitch: 72, startBeat: 0.5 + 20 * 4 });
    // The upbeat gets no click; the first downbeat lands on "Рос-".
    expect(song.beats[0]).toMatchObject({ downbeat: true });
    expect(song.beats[0]?.time).toBeCloseTo((0.5 * 60) / 152);
    expect(song.notes.every((note) => note.finger !== undefined)).toBe(true);
  });
});
