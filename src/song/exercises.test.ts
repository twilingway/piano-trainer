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
});
