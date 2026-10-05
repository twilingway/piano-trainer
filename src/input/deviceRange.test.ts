import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";
import {
  bestOctaveShift,
  captureKey,
  deviceKeys,
  outsideCount,
  parseDeviceRange,
  playableOf
} from "./deviceRange";
import type { RangeCapture } from "./deviceRange";

const note = (pitch: number, hand: Hand = "right"): SongNote => ({
  id: `n${String(pitch)}`,
  pitch,
  start: 0,
  duration: 1,
  startBeat: 0,
  hand
});
const RIGHT: ReadonlySet<Hand> = new Set(["right"]);

describe("device ranges", () => {
  it("knows the keys of each preset", () => {
    expect(deviceKeys({ preset: "61" })).toEqual({ low: 36, high: 96 });
    expect(deviceKeys({ preset: "25" })).toEqual({ low: 48, high: 72 });
    expect(deviceKeys({ preset: "76" })).toEqual({ low: 28, high: 103 });
  });

  it("limits nothing on the whole piano", () => {
    expect(playableOf({ preset: "88" })).toBeUndefined();
    expect(playableOf({ preset: "custom", low: 21, high: 108 })).toBeUndefined();
    expect(playableOf({ preset: "49" })).toEqual({ low: 36, high: 84 });
  });

  it("reads a stored range and falls back on a broken one", () => {
    expect(parseDeviceRange({ preset: "37" })).toEqual({ preset: "37" });
    expect(parseDeviceRange({ preset: "custom", low: 48, high: 84 })).toEqual({
      preset: "custom",
      low: 48,
      high: 84
    });
    expect(parseDeviceRange({ preset: "custom", low: 84, high: 48 })).toEqual({ preset: "88" });
    expect(parseDeviceRange({ preset: "custom", low: 10, high: 48 })).toEqual({ preset: "88" });
    expect(parseDeviceRange({ preset: "custom", low: 48 })).toEqual({ preset: "88" });
    expect(parseDeviceRange({ preset: "100" })).toEqual({ preset: "88" });
    expect(parseDeviceRange(null)).toEqual({ preset: "88" });
  });
});

describe("captureKey", () => {
  it("takes the two keys in either order", () => {
    let capture: RangeCapture = { step: "first" };
    capture = captureKey(capture, 84);
    capture = captureKey(capture, 48);
    expect(capture).toEqual({ step: "done", range: { preset: "custom", low: 48, high: 84 } });
  });

  it("waits for another key when the first comes again", () => {
    const capture = captureKey(captureKey({ step: "first" }, 60), 60);
    expect(capture).toEqual({ step: "second", first: 60 });
  });
});

describe("outsideCount", () => {
  it("counts only the hands' notes off the keyboard", () => {
    const notes = [note(40), note(60), note(90), note(30, "left")];
    expect(outsideCount(notes, RIGHT, { low: 48, high: 72 })).toBe(2);
    expect(outsideCount(notes, RIGHT, undefined)).toBe(0);
  });
});

describe("bestOctaveShift", () => {
  const C2_C6 = { low: 36, high: 84 };

  it("moves a part above the keyboard an octave down", () => {
    const high = [note(72), note(84), note(96)];
    expect(bestOctaveShift(high, RIGHT, C2_C6)).toBe(-1);
  });

  it("offers nothing when no shift helps", () => {
    const wide = [note(35), note(36), note(84), note(85)];
    expect(bestOctaveShift(wide, RIGHT, C2_C6)).toBe(0);
  });

  it("takes the smaller shift on a tie", () => {
    // Above the keyboard: an octave down and two down both fit it.
    const high = [note(90), note(91)];
    expect(bestOctaveShift(high, RIGHT, C2_C6)).toBe(-1);
  });

  it("measures from the shift already applied", () => {
    // The song is already an octave up: its notes are those shifted ones.
    const shifted = [note(84), note(96)];
    expect(bestOctaveShift(shifted, RIGHT, C2_C6, 1)).toBe(0);
  });
});
