import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import {
  songCourseNoteWindow,
  songCourseProgressRatio,
  songCourseStaffOffset
} from "./progressView";
import { expectedNote } from "./testFixtures";

const song: Song = {
  title: "Test",
  source: "musicxml",
  duration: 3,
  notes: [],
  measures: [],
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 1, position: 1, downbeat: false },
    { time: 1.5, position: 2, downbeat: false },
    { time: 2, position: 3, downbeat: false },
    { time: 3, position: 4, downbeat: true }
  ]
};

describe("musical progress and score window", () => {
  it("counts musical beats rather than answer count or elapsed wall time", () => {
    expect(songCourseProgressRatio(song, 1.5)).toBe(0.5);
    expect(songCourseProgressRatio(song, -1)).toBe(0);
    expect(songCourseProgressRatio(song, 3)).toBe(1);
    expect(songCourseProgressRatio(song, 9)).toBe(1);
  });
  it("keeps repeated Cs distinct and displays a real partial ending", () => {
    const notes = Array.from({ length: 6 }, (_, index) => expectedNote(index));
    expect(songCourseNoteWindow(notes, 0).map((note) => note.sourceNoteId)).toEqual([
      "test@r1:n0",
      "test@r1:n1",
      "test@r1:n2",
      "test@r1:n3"
    ]);
    expect(songCourseNoteWindow(notes, 4).map((note) => note.sourceNoteId)).toEqual([
      "test@r1:n4",
      "test@r1:n5"
    ]);
  });
  it("interpolates engraved positions under a fixed playhead", () => {
    const anchors = [
      { beat: 0, x: 100 },
      { beat: 1, x: 200 },
      { beat: 2, x: 400 }
    ];
    expect(songCourseStaffOffset(anchors, 1.5, 80)).toBe(-220);
    expect(songCourseStaffOffset(anchors, 9, 80)).toBe(-320);
  });
});
