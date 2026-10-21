import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import {
  KEYBOARD_BLACK_BACK,
  KEYBOARD_BLACK_FRONT,
  KEYBOARD_C4,
  KEYBOARD_DEPTH,
  KEYBOARD_DIP,
  KEYBOARD_METRES,
  metricC4X,
  metricKeyX,
  metricSourceUnits
} from "./keyboardMetrics";

describe("keyboard88 metric mapping", () => {
  it("matches the measured C3/D3/C4 centres using one metres-to-world scalar", () => {
    expect(KEYBOARD_METRES).toBe(1000);
    expect(metricKeyX(60)).toBe(0);
    expect(metricKeyX(50) - metricKeyX(48)).toBeCloseTo(23.5, 10);
    expect(metricKeyX(60) - metricKeyX(48)).toBeCloseTo(164.5, 10);
    expect(KEYBOARD_C4.x + metricKeyX(48) / KEYBOARD_METRES).toBeCloseTo(0.1955, 10);
    expect(KEYBOARD_C4.x + metricKeyX(50) / KEYBOARD_METRES).toBeCloseTo(0.219, 10);
    expect(KEYBOARD_DEPTH / KEYBOARD_METRES).toBe(0.15);
    expect(KEYBOARD_DIP / KEYBOARD_METRES).toBe(0.008);
    expect((KEYBOARD_BLACK_BACK - KEYBOARD_BLACK_FRONT) / KEYBOARD_METRES).toBeCloseTo(
      0.0940242,
      7
    );
  });

  it("preserves the same physical key spacing across all octaves and both sides of C4", () => {
    const keys = [...layoutKeyboard(1222).values()];
    const whites = keys.filter((key) => !key.black);
    expect(whites).toHaveLength(52);
    for (let index = 1; index < whites.length; index++) {
      const before = whites[index - 1];
      const after = whites[index];
      if (!before || !after) throw new Error("Missing white key");
      expect(metricKeyX(after.pitch) - metricKeyX(before.pitch)).toBeCloseTo(23.5, 10);
    }
    for (const key of keys) {
      if (key.pitch + 12 <= 108)
        expect(metricKeyX(key.pitch + 12) - metricKeyX(key.pitch)).toBeCloseTo(164.5, 10);
      if (key.black)
        expect(metricKeyX(key.pitch)).toBeCloseTo(
          (metricKeyX(key.pitch - 1) + metricKeyX(key.pitch + 1)) / 2,
          10
        );
    }
  });

  it.each([
    [390, 21, 108],
    [1280, 48, 72],
    [1600, 60, 64],
    [900, 58, 66]
  ])("maps source centres without stretching MIDI pitches (%s, %s..%s)", (width, low, high) => {
    const keys = layoutKeyboard(width, low, high);
    const units = metricSourceUnits(keys.values());
    const sourceX = (pixel: number) => (pixel - width / 2 - 37) * units;
    const c4 = metricC4X(keys.values(), sourceX);
    for (const key of keys.values())
      expect(c4 + metricKeyX(key.pitch)).toBeCloseTo(sourceX(key.x + key.width / 2), 9);
  });
});
