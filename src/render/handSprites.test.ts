import { describe, expect, it } from "vitest";

import type { Finger } from "../fingering/fingering";
import { fitPose, pixelsPerKey } from "./handSprites";
import type { PoseSprite } from "./handSprites";

// Picture pixels: 100 per white key, fingertips at y 0.
const pose = (id: string, xs: readonly number[], pressed: readonly Finger[]): PoseSprite => ({
  id,
  tips: {
    1: { x: xs[0] ?? 0, y: 0 },
    2: { x: xs[1] ?? 0, y: 0 },
    3: { x: xs[2] ?? 0, y: 0 },
    4: { x: xs[3] ?? 0, y: 0 },
    5: { x: xs[4] ?? 0, y: 0 }
  },
  pressed: new Set(pressed)
});
const five = pose("five", [0, 100, 200, 300, 400], [1, 2, 3, 4, 5]);
const octave = pose("octave", [0, 180, 360, 540, 700], [1, 5]);
const poses = [five, octave];

describe("fitPose", () => {
  it("measures a white key in the five-finger pose", () => {
    expect(pixelsPerKey(five)).toBe(100);
  });

  it("picks the five-finger pose for C-E-G and slides it onto the keys", () => {
    // Keys 20 px wide: thumb at 110, the fifth finger four keys on.
    const fit = fitPose(
      poses,
      "right",
      new Map([
        [1, 110],
        [3, 150],
        [5, 190]
      ]),
      20,
      100
    );
    expect(fit?.pose.id).toBe("five");
    expect(fit?.x).toBeCloseTo(110);
    expect(fit?.miss).toBeCloseTo(0);
  });

  it("picks the open hand for an octave", () => {
    const fit = fitPose(
      poses,
      "right",
      new Map([
        [1, 110],
        [5, 250]
      ]),
      20,
      100
    );
    expect(fit?.pose.id).toBe("octave");
  });

  it("mirrors the picture for the left hand", () => {
    const fit = fitPose(
      poses,
      "left",
      new Map([
        [1, 200],
        [5, 120]
      ]),
      20,
      100
    );
    expect(fit?.scaleX).toBeLessThan(0);
    expect(fit?.x).toBeCloseTo(200);
  });

  it("has nothing to fit without a placed finger", () => {
    expect(fitPose(poses, "right", new Map(), 20, 100)).toBeUndefined();
  });
});
