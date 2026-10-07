import { describe, expect, it } from "vitest";

import type { Finger, Hand } from "../fingering/fingering";
import { HAND_RENDERS, handPoseSet } from "./handRenderCatalog";
import { fitPose } from "./handSprites";

const WHITE = 30;
/** Centre of the white key `index` steps up from C4. */
const white = (index: number) => (index + 0.5) * WHITE;

function fit(hand: Hand, targets: readonly (readonly [Finger, number])[]) {
  return fitPose(HAND_RENDERS, hand, new Map(targets), WHITE, Number.NaN, true);
}

describe("3D hand catalog", () => {
  it("holds 42 poses with five measured pads and a picture each", () => {
    expect(HAND_RENDERS).toHaveLength(42);
    for (const pose of HAND_RENDERS) {
      expect(pose.url).toContain(".webp");
      expect(pose.pixelsPerKey).toBeGreaterThan(0);
      for (const tip of Object.values(pose.tips)) {
        expect(Number.isFinite(tip.x) && Number.isFinite(tip.y)).toBe(true);
      }
    }
  });

  it("picks the pose pressing exactly fingers 2 and 5 for D and G", () => {
    const chosen = fit("right", [
      [2, white(1)],
      [5, white(4)]
    ]);
    expect(chosen?.pose.id).toBe("fingers-18");
  });

  it("puts the pads of a C-E-G triad on their keys", () => {
    const chosen = fit("right", [
      [1, white(0)],
      [3, white(2)],
      [5, white(4)]
    ]);
    expect([...(chosen?.pose.pressed ?? [])].sort()).toEqual([1, 3, 5]);
    // pads lie within a third of a key of the key centres
    expect(chosen?.miss).toBeLessThan(WHITE);
  });

  it("mirrors the triad for the left hand's 5-3-1", () => {
    const chosen = fit("left", [
      [5, white(0)],
      [3, white(2)],
      [1, white(4)]
    ]);
    expect([...(chosen?.pose.pressed ?? [])].sort()).toEqual([1, 3, 5]);
    expect(chosen?.scaleX).toBeLessThan(0);
    expect(chosen?.miss).toBeLessThan(WHITE);
  });

  it("opens the hand for an octave at one scale with the other poses", () => {
    const chosen = fit("right", [
      [1, white(0)],
      [5, white(7)]
    ]);
    expect(chosen?.pose.id).toBe("octave");
    expect(Math.abs(chosen?.scaleX ?? 0) * (chosen?.pose.pixelsPerKey ?? 0)).toBeCloseTo(WHITE);
  });

  it("plays a lone thumb with the five-finger hand, not the tucked thumb", () => {
    expect(fit("right", [[1, white(0)]])?.pose.id).toBe("fingers-1");
  });
});

describe("handPoseSet", () => {
  const drawn = ["five"];
  it("keeps the drawn poses in the drawn style", () => {
    expect(handPoseSet("drawn", drawn, ["triad"])).toEqual({ poses: drawn, exactPressed: false });
  });

  it("falls back to the drawn poses until a render has loaded", () => {
    expect(handPoseSet("rendered", drawn, [])).toEqual({ poses: drawn, exactPressed: false });
  });

  it("fits the loaded renders, even a part of them, with exact pressed fingers", () => {
    expect(handPoseSet("rendered", drawn, ["triad"])).toEqual({
      poses: ["triad"],
      exactPressed: true
    });
  });
});
