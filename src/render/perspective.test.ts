import { describe, expect, it } from "vitest";

import { roadProjection } from "./perspective";

describe("roadProjection", () => {
  // A 1000-wide view, the hit line at y 800, the horizon at y 200, the far edge 0.4 as wide.
  const road = roadProjection(1000, 800, 200, 0.4);

  it("spans the view at the hit line", () => {
    expect(road.at(0, 1)).toEqual({ x: 0, y: 800, scale: 1 });
    expect(road.at(1000, 1).x).toBe(1000);
  });

  it("narrows to its share of the width at the horizon, around the middle", () => {
    const left = road.at(0, 0);
    const right = road.at(1000, 0);
    expect(left.y).toBe(200);
    expect(left.x).toBeCloseTo(300);
    expect(right.x).toBeCloseTo(700);
    expect(left.scale).toBeCloseTo(0.4);
  });

  it("can size the notes as on a deeper floor than the lanes converge", () => {
    const steep = roadProjection(1000, 800, 200, 0.8, 0.2);
    expect(steep.at(0, 0).x).toBeCloseTo(100);
    expect(steep.at(0, 0).scale).toBeCloseTo(0.2);
    expect(steep.at(0, 1)).toEqual({ x: 0, y: 800, scale: 1 });
  });

  it("gives every key a point of its own on the horizon", () => {
    expect(road.at(100, 0).x).not.toBeCloseTo(road.at(200, 0).x);
  });

  it("closes up towards the horizon: halfway down the lane is above the screen's midpoint", () => {
    const half = road.at(500, 0.5);
    expect(half.scale).toBeCloseTo(1 / 1.75);
    expect(half.y).toBeLessThan(500);
    // A quarter of the lane from the horizon covers less screen than a quarter near the keys.
    expect(road.at(500, 0.25).y - 200).toBeLessThan(800 - road.at(500, 0.75).y + 1e-9);
  });
});
