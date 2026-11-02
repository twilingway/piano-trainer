import { describe, expect, it } from "vitest";
import type { FrameState } from "./frameState";
import { flatHoldBounds } from "./holdBounds";
import { NOTE_WIDTH_SHARE, readableNoteFaceHeight } from "./noteReadability";
import { roadFrameState } from "./viewEffects";

describe("shared direct note readability", () => {
  it("extends only the visual preview while retaining the original performance snapshot", () => {
    const frame: FrameState = {
      time: 12.5,
      lookAhead: 1,
      pressed: new Set([60]),
      sounding: new Set([64]),
      due: [],
      hands: new Set(),
      statusOf: () => undefined,
      owns: () => true,
      hintSpeed: 0.75
    };
    const road = { notePlace: (x: number, y: number) => ({ x, y: y / 4, scale: 1 }) };
    for (const visual of [
      roadFrameState(frame, undefined, 400, 20),
      roadFrameState(frame, road, 400, 20)
    ]) {
      expect(visual.lookAhead).not.toBe(frame.lookAhead);
      expect({ ...visual, lookAhead: frame.lookAhead }).toEqual(frame);
      expect(visual.pressed).toBe(frame.pressed);
      expect(visual.sounding).toBe(frame.sounding);
    }
    expect(frame.lookAhead).toBe(1);
  });

  it("keeps short flat notes as readable as the native overhead face and consumes them at their end", () => {
    for (const keyWidth of [12, 24, 44, 80]) {
      const width = keyWidth * NOTE_WIDTH_SHARE;
      const minimum = readableNoteFaceHeight(width, false);
      const face = flatHoldBounds(1, 0.02, 1, 2.22, 400, 0, minimum);
      expect(width).toBeGreaterThan(keyWidth);
      expect(face.bottom - face.top).toBeGreaterThanOrEqual(minimum - 1e-6);
      expect(minimum).toBeGreaterThanOrEqual(18);
      expect(minimum).toBeLessThanOrEqual(30);
      expect(flatHoldBounds(1, 0.02, 1.02, 2.22, 400, 0, minimum)).toEqual({
        top: 400,
        bottom: 400
      });
    }
  });
});
