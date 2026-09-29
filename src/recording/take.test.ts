import { describe, expect, it } from "vitest";

import { TakeRecorder } from "./take";
import type { TakeSettings } from "./take";

const settings: TakeSettings = {
  songKey: "song",
  mode: "tempo",
  speed: 1,
  hands: ["right"],
  from: 0
};
const WHEN = "2026-09-29T00:00:00Z";

describe("TakeRecorder", () => {
  it("keeps each key's velocity and how long the finger held it, on both clocks", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 80, 0, 0.1);
    recorder.noteOn(64, 50, 0.5, 0.6);
    recorder.noteOff(60, 0.9, 1.0);
    recorder.noteOff(64, 1.2, 1.3);
    const take = recorder.finish(2, 2.1, "t1", WHEN);
    expect(take.notes).toEqual([
      { pitch: 60, velocity: 80, start: 0, end: 0.9, realStart: 0.1, realEnd: 1.0 },
      { pitch: 64, velocity: 50, start: 0.5, end: 1.2, realStart: 0.6, realEnd: 1.3 }
    ]);
  });

  it("records the pedal on its own and closes what is still held at the end", () => {
    const recorder = new TakeRecorder(settings);
    recorder.setPedal(true, 0.2, 0.2);
    recorder.noteOn(67, 90, 0.3, 0.3);
    recorder.setPedal(false, 0.8, 0.8);
    recorder.setPedal(true, 1.0, 1.0);
    const take = recorder.finish(1.5, 1.6, "t2", WHEN);
    expect(take.pedal).toEqual([
      { start: 0.2, end: 0.8, realStart: 0.2, realEnd: 0.8 },
      { start: 1.0, end: 1.5, realStart: 1.0, realEnd: 1.6 }
    ]);
    expect(take.notes).toEqual([
      { pitch: 67, velocity: 90, start: 0.3, end: 1.5, realStart: 0.3, realEnd: 1.6 }
    ]);
  });

  it("ends a note struck again without a release where the new one starts", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 70, 0, 0);
    recorder.noteOn(60, 75, 0.5, 0.5);
    const take = recorder.finish(1, 1, "t3", WHEN);
    expect(take.notes.map((note) => [note.start, note.end])).toEqual([
      [0, 0.5],
      [0.5, 1]
    ]);
  });
});
