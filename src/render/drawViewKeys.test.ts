import { describe, expect, it, vi } from "vitest";
import { drawViewKeys } from "./drawViewKeys";
import type { FrameState } from "./frameState";
import type { HandsLayer } from "./HandsLayer";
import { viewGeometry } from "./viewGeometry";

describe("native pianist song time", () => {
  it("follows playback, pause and backwards seeks with sprite hands hidden", () => {
    const hands = { container: { visible: false }, time: 0, draw: vi.fn() };
    const geometry = viewGeometry(800, 20, { notes: true, keys: true, hands: false }, false);
    for (const time of [90, 91, 145, 145, 45]) {
      const frame: FrameState = {
        time,
        lookAhead: 3,
        statusOf: () => undefined,
        pressed: new Set(),
        sounding: new Set(),
        due: [],
        hands: new Set(),
        owns: () => false
      };
      drawViewKeys(
        undefined,
        hands as unknown as HandsLayer,
        new Map(),
        geometry,
        false,
        frame,
        new Map(),
        undefined,
        0,
        1 / 60
      );
      expect(hands.time).toBe(time);
    }
    expect(hands.draw).not.toHaveBeenCalled();
  });
});
