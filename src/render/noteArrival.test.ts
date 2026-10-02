import { describe, expect, it } from "vitest";
import { arrivalCardAlpha, arrivalFrame, noteArrivalAge } from "./noteArrival";

describe("note arrival phases", () => {
  it("starts at the note's look-ahead boundary and reveals its card after the flash", () => {
    expect(noteArrivalAge(10, 6, 4)).toBe(0);
    expect(arrivalFrame(0, 15)).toBe(0);
    expect(arrivalCardAlpha(0)).toBe(0);
    expect(arrivalCardAlpha(0.18)).toBe(0);
    expect(arrivalCardAlpha(0.26)).toBeCloseTo(0.5);
    expect(arrivalCardAlpha(0.34)).toBeCloseTo(1);
  });

  it("freezes on pause and repeated frames, regardless of elapsed wall time", () => {
    const age = noteArrivalAge(10, 6.25, 4);
    expect(arrivalFrame(age, 15)).toBe(7);
    expect(arrivalFrame(noteArrivalAge(10, 6.25, 4), 15)).toBe(7);
    expect(arrivalCardAlpha(age)).toBeCloseTo(0.4375);
  });

  it("seeks to the current phase without replaying old bursts and restarts on rewind", () => {
    expect(arrivalFrame(noteArrivalAge(10, 7, 4), 15)).toBeUndefined();
    expect(arrivalCardAlpha(noteArrivalAge(10, 7, 4))).toBe(1);
    expect(arrivalFrame(noteArrivalAge(10, 6.1, 4), 15)).toBe(2);
    expect(arrivalCardAlpha(noteArrivalAge(10, 6.1, 4))).toBe(0);
  });

  it("skips expired phases at low FPS without shifting the note's landing time", () => {
    expect(arrivalFrame(0.49, 15)).toBe(14);
    expect(arrivalFrame(0.5, 15)).toBeUndefined();
    expect(arrivalFrame(noteArrivalAge(10, 10, 4), 15)).toBeUndefined();
    expect(arrivalCardAlpha(noteArrivalAge(10, 10, 4))).toBe(1);
  });

  it("does not draw unborn notes or an unavailable atlas", () => {
    expect(arrivalFrame(-0.01, 15)).toBeUndefined();
    expect(arrivalCardAlpha(-0.01)).toBe(0);
    expect(arrivalFrame(0.1, 0)).toBeUndefined();
    expect(arrivalFrame(Number.NaN, 15)).toBeUndefined();
  });
});
