// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { lessonSong } from "./lessons";
import { transposeSong } from "./songSelectors";
import type * as Exercises from "../song/exercises";

vi.mock("../song/localLessons", async () => {
  const { EXERCISES } = await vi.importActual<typeof Exercises>("../song/exercises");
  const musicXml = EXERCISES[0]?.levels[0]?.musicXml ?? "";
  return {
    LOCAL_LESSONS: [
      {
        id: "local:Sample",
        title: "Sample",
        levels: [
          { id: "1 Signed.musicxml", title: "Signed", musicXml, stage: { sign: "Sample sign" } },
          { id: "2 Plain.musicxml", title: "Plain", musicXml }
        ]
      }
    ]
  };
});

describe("a local level's stage", () => {
  it("rides on the level's song and survives transposition", () => {
    const song = lessonSong({ exerciseId: "local:Sample", levelId: "1 Signed.musicxml" });
    expect(song.stage).toEqual({ sign: "Sample sign" });
    expect(transposeSong(song, 2, undefined).stage).toEqual({ sign: "Sample sign" });
    expect(transposeSong(song, -1, undefined).source).toBe("musicxml");
  });
  it("is absent for a level without one", () => {
    const song = lessonSong({ exerciseId: "local:Sample", levelId: "2 Plain.musicxml" });
    expect(song).not.toHaveProperty("stage");
  });
});
