import { describe, expect, it } from "vitest";
import { blurSampleStep, unpremultiplyPixels } from "./rendererMath";
describe("logical blur sampling", () => {
  it.each([1, 1.5, 2, 3])("preserves a ten pixel kernel radius at resolution %s", (resolution) => {
    const width = 320,
      height = 180,
      pw = width * resolution,
      ph = height * resolution;
    const step = blurSampleStep(10, pw, ph, resolution);
    // The shader's outer tap is three sample steps from the center.
    expect((3 * step.x * pw) / resolution).toBeCloseTo(10);
    expect((3 * step.y * ph) / resolution).toBeCloseTo(10);
  });
  it("keeps the same normalized sampling for a high resolution baked label", () => {
    expect(blurSampleStep(3, 128, 64, 1)).toEqual(blurSampleStep(3, 384, 192, 3));
  });
});

describe("retained baked pixels", () => {
  it("restores straight RGB while preserving partially transparent glyph edges", () => {
    const pixels = new Uint8Array([128, 0, 0, 128, 10, 20, 30, 255, 9, 12, 15, 0, 40, 60, 80, 100]);
    unpremultiplyPixels(pixels);
    expect(Array.from(pixels)).toEqual([
      255, 0, 0, 128, 10, 20, 30, 255, 0, 0, 0, 0, 102, 153, 204, 100
    ]);
  });
});
