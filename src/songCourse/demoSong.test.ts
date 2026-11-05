// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { buildSongCourseMaterial } from "./material";
import { PracticeSession } from "../practice/session";
import { songCourseDemoSong } from "./demoSong";

const source = findSongCourseSource("hot-cross-buns");
if (!source) throw new Error("missing fixture");

describe("introductory demonstration score", () => {
  it.each([
    "notes-c",
    "notes-d",
    "notes-e",
    "quarter",
    "half",
    "whole",
    "guided-1",
    "independent-1",
    "performance"
  ])(
    "isolates the written learner notes for %s without transposing or altering the score",
    (suffix) => {
      const material = buildSongCourseMaterial(source, `hot-cross-buns/${suffix}`);
      const before = material.song.notes.slice();
      const demo = songCourseDemoSong(material);
      expect(demo.notes.map((note) => note.id)).toEqual(
        material.expected.map((note) => note.runtimeNoteId)
      );
      expect(demo.notes.map((note) => note.pitch)).toEqual(
        material.expected.map((note) => note.pitch)
      );
      expect(demo.notes.map((note) => note.start)).toEqual(
        material.expected.map((note) => note.start)
      );
      expect(demo.notes.every((note) => material.song.notes.includes(note))).toBe(true);
      expect(demo.notes.every((note) => source.learnerPartIds.includes(note.part ?? ""))).toBe(
        true
      );
      expect(demo.beats).toBe(material.song.beats);
      expect(demo.measures).toBe(material.song.measures);
      expect(demo.duration).toBe(material.song.duration);
      expect(material.song.notes).toEqual(before);
      expect(
        material.song.notes.some((note) => source.accompanimentPartIds.includes(note.part ?? ""))
      ).toBe(true);
    }
  );
  it("sounds exactly the final learner melody while preserving the real answer accompaniment", () => {
    const material = buildSongCourseMaterial(source, "hot-cross-buns/performance");
    const options = {
      mode: "tempo" as const,
      speed: 1,
      hands: new Set<"right">(),
      accompaniment: true
    };
    const demo = new PracticeSession(songCourseDemoSong(material), options);
    expect(
      demo.song.notes
        .filter((note) => demo.accompanies(note))
        .map((note) => [note.pitch, note.start, note.duration])
    ).toEqual(material.expected.map((note) => [note.pitch, note.start, note.duration]));
    const learner = new PracticeSession(material.song, {
      ...options,
      hands: new Set(["right"]),
      parts: new Set(source.learnerPartIds)
    });
    expect(
      learner.song.notes
        .filter((note) => learner.accompanies(note))
        .every((note) => source.accompanimentPartIds.includes(note.part ?? ""))
    ).toBe(true);
    expect(learner.song.notes.some((note) => learner.accompanies(note))).toBe(true);
  });
});
