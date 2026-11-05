import { describe, expect, it } from "vitest";
import { SongCourseHold } from "./songCourseHold";
import type { CourseExpectedNote } from "../songCourse/model";
const note: CourseExpectedNote = {
  sourceNoteId: "source@1:c",
  runtimeNoteId: "c",
  pitch: 60,
  start: 0,
  startBeat: 0,
  duration: 2,
  phraseId: "phrase",
  measureIndex: 0
};
describe("accepted hold segments", () => {
  it("freezes during a pause and resumes the remainder only for its physical owner", () => {
    const hold = new SongCourseHold();
    hold.accept(note, "keyboard:c", 4);
    expect(hold.read(4.5)?.progress).toBe(0.25);
    hold.pause(4.5);
    expect(hold.read(100)).toMatchObject({ progress: 0.25, paused: true });
    hold.release("keyboard:c", true);
    expect(hold.resume("foreign:c", 100)).toBeNull();
    expect(hold.read(101)?.progress).toBe(0.25);
    expect(hold.resume("keyboard:c", 100)).toBe(note.sourceNoteId);
    expect(hold.read(100.5)).toMatchObject({ progress: 0.5, paused: false });
    expect(hold.read(99)?.progress).toBe(0.5);
    expect(hold.read(101.5)).toMatchObject({ progress: 1, action: "release" });
    expect(hold.read(102)).not.toBeNull();
    hold.release("keyboard:c", false);
    expect(hold.read(102)).toBeNull();
  });
  it("does not let a wrong release clear the accepted key and resets for a new accepted note", () => {
    const hold = new SongCourseHold();
    hold.accept(note, "keyboard:c", 0);
    hold.release("keyboard:d", false);
    expect(hold.read(1)?.progress).toBe(0.5);
    hold.accept({ ...note, sourceNoteId: "source@1:d", pitch: 62 }, "keyboard:d", 1);
    expect(hold.read(1)).toMatchObject({ sourceNoteId: "source@1:d", progress: 0 });
    hold.clear();
    expect(hold.read(2)).toBeNull();
  });
});
