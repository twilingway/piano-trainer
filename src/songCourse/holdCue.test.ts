import { describe, expect, it } from "vitest";
import { courseHoldCue } from "./holdCue";
import type { CourseExpectedNote } from "./model";
const note: CourseExpectedNote = {
  sourceNoteId: "source@1:c",
  runtimeNoteId: "c",
  pitch: 60,
  start: 0,
  startBeat: 0,
  duration: 1,
  phraseId: "phrase",
  measureIndex: 0
};
describe("musical hold cue", () => {
  it("fills different written lengths by their source duration", () => {
    expect(courseHoldCue(note, 0.5)).toMatchObject({
      progress: 0.5,
      action: "hold",
      color: "#ff7b80"
    });
    expect(courseHoldCue({ ...note, duration: 2, pitch: 62 }, 0.5)).toMatchObject({
      progress: 0.25,
      action: "hold",
      color: "#ffb84d"
    });
    expect(courseHoldCue({ ...note, duration: 2 }, 2)).toMatchObject({
      progress: 1,
      action: "release"
    });
  });
  it("clamps the milestone without turning it into a grade or a release event", () => {
    expect(courseHoldCue(note, 10)).toMatchObject({ progress: 1, action: "release" });
    expect(courseHoldCue(note, -1)?.progress).toBe(0);
    expect(courseHoldCue(note, 0.1, 0.6)?.progress).toBe(0.6);
    expect(courseHoldCue(note, Number.NaN)).toBeNull();
    expect(courseHoldCue({ ...note, duration: 0 }, 1)).toBeNull();
    expect(note.duration).toBe(1);
  });
});
