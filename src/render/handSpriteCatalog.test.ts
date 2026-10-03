import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import { HAND_SPRITES } from "./handSpriteCatalog";
import { fitPose } from "./handSprites";

describe("calibrated hand catalog", () => {
  for (const hand of ["left", "right"] satisfies Hand[]) {
    for (const [id, keys] of [
      ["five", 4],
      ["sixth", 5],
      ["seventh", 6],
      ["octave", 7]
    ] as const) {
      it(`selects ${id} for the ${hand} hand at any keyboard scale`, () => {
        for (const whiteWidth of [18, 44, 72]) {
          const direction = hand === "right" ? 1 : -1;
          const fit = fitPose(
            HAND_SPRITES,
            hand,
            new Map([
              [1, 500],
              [5, 500 + keys * whiteWidth * direction]
            ]),
            whiteWidth,
            Number.NaN
          );
          if (fit?.pose.pixelsPerKey === undefined) throw new Error("Missing calibrated fit");
          expect(fit.pose.id).toBe(id);
          const calibratedWidth = Math.abs(fit.scaleX) * fit.pose.pixelsPerKey;
          expect(calibratedWidth).toBeGreaterThanOrEqual(whiteWidth * 0.8);
          expect(calibratedWidth).toBeLessThanOrEqual(whiteWidth * 1.2);
          expect(fit.scaleX * direction).toBeGreaterThan(0);
          expect(fit.x + fit.pose.tips[1].x * fit.scaleX).toBeCloseTo(500);
          expect(fit.x + fit.pose.tips[5].x * fit.scaleX).toBeCloseTo(
            500 + keys * whiteWidth * direction
          );
          expect(fit.miss).toBeCloseTo(0);
        }
      });
    }
  }

  it("keeps measured spans in white-key units despite different raster resolutions", () => {
    const expected: Readonly<Record<string, number>> = {
      five: 563 / (379 / 3),
      sixth: 5,
      seventh: 6,
      octave: 7
    };
    for (const pose of HAND_SPRITES) {
      expect(pose.url).toContain(".webp");
      const span = (pose.tips[5].x - pose.tips[1].x) / pose.pixelsPerKey;
      expect(span).toBeCloseTo(expected[pose.id] ?? Number.NaN);
    }
  });
});
