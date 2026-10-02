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
  it("keeps the old release API working when an attack includes input metadata", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 90, 1, 1, "piano", {
      rawTimestampMs: 2100,
      correctedTimestampMs: 2000,
      inputOffsetMs: 100,
      source: "midi"
    });
    recorder.noteOff(60, 1.5, 1.5, "piano");
    expect(recorder.finish(2, 2, "legacy-off", WHEN).notes[0]?.end).toBe(1.5);
  });
  it("routes a late release to the old closed span without ending a newer attack", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 70, 0, 0, "piano");
    recorder.noteOn(60, 75, 1, 1, "piano");
    recorder.noteOff(60, 0.9, 0.9, "piano");
    recorder.noteOff(60, 1.5, 1.5, "piano");
    const take = recorder.finish(2, 2, "late-off", WHEN);
    expect(take.notes.map((note) => [note.start, note.end])).toEqual([
      [0, 0.9],
      [1, 1.5]
    ]);
  });
  it("does not overwrite a newer open attack with an older delivered note on", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 90, 1, 1, "piano");
    recorder.noteOn(60, 70, 0.8, 0.8, "piano");
    recorder.noteOff(60, 0.9, 0.9, "piano");
    const take = recorder.finish(2, 2, "late-on", WHEN);
    expect(take.notes).toEqual([
      { deviceId: "piano", pitch: 60, velocity: 90, start: 1, end: 2, realStart: 1, realEnd: 2 }
    ]);
  });
  it("uses corrected source timestamps to order events even when pause freezes both take clocks", () => {
    const recorder = new TakeRecorder(settings);
    const timing = (correctedTimestampMs: number) => ({
      rawTimestampMs: correctedTimestampMs + 100,
      correctedTimestampMs,
      inputOffsetMs: 100,
      source: "midi"
    });
    recorder.noteOn(60, 70, 1, 1, "piano", timing(1000));
    recorder.noteOn(60, 90, 1, 1, "piano", timing(1100));
    recorder.noteOff(60, 1, 1, "piano", timing(1050));
    recorder.noteOff(60, 1.5, 1.5, "piano", timing(1500));
    const take = recorder.finish(2, 2, "timestamps", WHEN);
    expect(take.notes).toHaveLength(2);
    expect(take.notes[0]?.inputTiming).toEqual(timing(1000));
    expect(take.notes[1]?.end).toBe(1.5);
  });
  it("keeps simultaneous keys from two devices independent", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 70, 0, 0, "usb");
    recorder.noteOn(60, 90, 0.1, 0.1, "ble");
    recorder.noteOff(60, 0.5, 0.5, "usb");
    const take = recorder.finish(1, 1, "devices", WHEN);
    expect(take.notes.map((note) => [note.deviceId, note.end])).toEqual([
      ["usb", 0.5],
      ["ble", 1]
    ]);
  });
  it("clamps note and pedal durations when finish or pedal release moves backwards", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 90, 1, 1);
    recorder.setPedal(true, 1, 1);
    recorder.setPedal(false, 0.5, 0.5);
    const take = recorder.finish(0.5, 0.5, "backwards", WHEN);
    expect(take.notes[0]?.end).toBe(1);
    expect(take.notes[0]?.realEnd).toBe(1);
    expect(take.pedal[0]).toEqual({ start: 1, realStart: 1, end: 1, realEnd: 1 });
  });
  it("rejects nonfinite note and pedal events without damaging a valid take", () => {
    const recorder = new TakeRecorder(settings);
    recorder.noteOn(60, 90, 1, 1);
    recorder.noteOn(60, 90, NaN, 2);
    recorder.noteOff(60, Infinity, 2);
    recorder.setPedal(true, NaN, 1);
    const take = recorder.finish(2, 2, "finite", WHEN);
    expect(take.notes).toHaveLength(1);
    expect(take.notes[0]?.end).toBe(2);
    expect(take.pedal).toEqual([]);
  });
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
