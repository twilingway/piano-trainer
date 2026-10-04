import { describe, expect, it } from "vitest";

import { quadPoint, roadProjection } from "./perspective";

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
    const wide = roadProjection(1000, 800, 200, 0.8, 0.2);
    expect(wide.at(0, 0).x).toBeCloseTo(100);
    expect(wide.at(0, 0).scale).toBeCloseTo(0.2);
    expect(wide.at(0, 1)).toEqual({ x: 0, y: 800, scale: 1 });
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

it("places the transition at screen progress for different perspective shapes", () => {
  for (const far of [0.05, 0.1, 0.4, 0.8]) {
    const road = roadProjection(1000, 800, 200, far);
    const depth = road.depthAt(0.78);
    expect(road.progressAt(depth)).toBeCloseTo(0.78);
    expect(road.at(500, depth).y).toBeCloseTo(200 + 600 * 0.78);
  }
});

describe("quadPoint", () => {
  // Any projective map: the corners of the unit square and a point inside go through it.
  const map = (u: number, v: number) => {
    const w = 0.001 * u * 100 + 0.002 * v * 100 + 1;
    return {
      x: (2 * u * 100 + 0.5 * v * 100 + 10) / w,
      y: (0.2 * u * 100 + 1.5 * v * 100 + 20) / w,
      scale: 1
    };
  };
  const quad = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)] as const;

  it("finds a point's place on a quad drawn in perspective", () => {
    for (const [u, v] of [
      [0.3, 0.7],
      [0, 0],
      [1, 1],
      [0.9, 0.1]
    ] as const) {
      const point = map(u, v);
      const found = quadPoint(point.x, point.y, quad);
      expect(found?.u).toBeCloseTo(u, 6);
      expect(found?.v).toBeCloseTo(v, 6);
    }
  });

  it("knows nothing of a flattened quad", () => {
    const flat = { x: 0, y: 0, scale: 1 };
    expect(quadPoint(1, 1, [flat, flat, flat, flat])).toBeUndefined();
  });
});
