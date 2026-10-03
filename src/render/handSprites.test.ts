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

  it.each(["right", "left"] as const)("stretches a %s hand onto a wider chord", (hand) => {
    const direction = hand === "right" ? 1 : -1;
    const targets = new Map<Finger, number>([
      [1, 200],
      [5, 200 + direction * 88]
    ]);
    const fit = fitPose([five], hand, targets, 20, 100);
    expect(fit).toBeDefined();
    if (!fit) return;
    for (const [finger, x] of targets) {
      expect(fit.x + five.tips[finger].x * fit.scaleX).toBeCloseTo(x);
    }
    expect(Math.abs(fit.scaleX)).toBeCloseTo(0.22);
  });

  it("limits stretching for an unreachable chord rather than distorting the hand", () => {
    const fit = fitPose(
      [five],
      "right",
      new Map([
        [1, 100],
        [5, 500]
      ]),
      20,
      100
    );
    expect(fit?.scaleX).toBeCloseTo(0.24);
    expect(fit?.miss).toBeGreaterThan(0);
  });

  it("anchors the only active fingertip exactly in both axes", () => {
    const drawn = { ...five, tips: { ...five.tips, 1: { x: 100, y: 300 } } };
    const fit = fitPose([drawn], "right", new Map([[1, 150]]), 20, 100, new Map([[1, 250]]));
    expect(fit).toBeDefined();
    if (!fit) return;
    expect(fit.x + drawn.tips[1].x * fit.scaleX).toBeCloseTo(150);
    expect(fit.y + drawn.tips[1].y * fit.scaleY).toBeCloseTo(250);
  });

  it("compresses a chord vertically and never drops active fingertips below their keys", () => {
    const drawn = { ...five, tips: { ...five.tips, 1: { x: 0, y: 300 }, 5: { x: 400, y: 100 } } };
    const ys = new Map<Finger, number>([
      [1, 250],
      [5, 250]
    ]);
    const fit = fitPose(
      [drawn],
      "right",
      new Map([
        [1, 100],
        [5, 180]
      ]),
      20,
      100,
      ys
    );
    expect(fit).toBeDefined();
    if (!fit) return;
    expect(fit.scaleY).toBeCloseTo(0.16);
    for (const [finger, y] of ys) {
      expect(fit.y + drawn.tips[finger].y * fit.scaleY).toBeLessThanOrEqual(y);
    }
    expect(fit.y + drawn.tips[1].y * fit.scaleY).toBeCloseTo(250);
  });

  it("prefers a pose that presses the placed fingers over one that only lies near", () => {
    // Same tips, only which fingers press differs: the one pressing 1 and 5 wins.
    const lying = pose("lying", [0, 100, 200, 300, 400], [2, 3, 4]);
    const pressing = pose("pressing", [0, 100, 200, 300, 400], [1, 5]);
    const fit = fitPose(
      [lying, pressing],
      "right",
      new Map([
        [1, 110],
        [5, 190]
      ]),
      20,
      100
    );
    expect(fit?.pose.id).toBe("pressing");
  });

  it("refuses a pose measured wrong", () => {
    expect(fitPose(poses, "right", new Map([[1, 110]]), 20, Number.NaN)).toBeUndefined();
    expect(fitPose(poses, "right", new Map([[1, 110]]), 0, 100)).toBeUndefined();
  });

  it("has nothing to fit without a placed finger", () => {
    expect(fitPose(poses, "right", new Map(), 20, 100)).toBeUndefined();
  });

  it("rejects infinite keyboard geometry and target coordinates", () => {
    expect(fitPose(poses, "right", new Map([[1, Infinity]]), 20, 100)).toBeUndefined();
    expect(fitPose(poses, "right", new Map([[1, 110]]), Infinity, 100)).toBeUndefined();
    expect(fitPose(poses, "right", new Map([[1, 110]]), 20, Infinity)).toBeUndefined();
    expect(
      fitPose(poses, "right", new Map([[1, 110]]), 20, 100, new Map([[1, NaN]]))
    ).toBeUndefined();
  });

  it("skips invalid calibration and measured fingertips rather than returning NaN", () => {
    const invalid = { ...five, pixelsPerKey: 0 };
    const invalidTip = { ...five, tips: { ...five.tips, 1: { x: Number.NaN, y: 0 } } };
    const fit = fitPose([invalid, invalidTip, five], "right", new Map([[1, 110]]), 20, 100);
    expect(fit?.pose).toBe(five);
    expect(Number.isFinite(fit?.x)).toBe(true);
    expect(Number.isFinite(fit?.miss)).toBe(true);
  });
});
