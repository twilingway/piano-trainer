import { describe, expect, it } from "vitest";

import { depthBetween, floorCamera } from "./perspective";

describe("floorCamera", () => {
  // A 1000×800 view with the horizon at y 200.
  const camera = floorCamera(1000, 800, 200);

  it("spans the view's bottom edge at depth 1", () => {
    expect(camera.at(0, 1)).toEqual({ x: 0, y: 800, scale: 1 });
    expect(camera.at(1000, 1).x).toBe(1000);
  });

  it("halves size and drop at twice the depth, and nears the horizon far away", () => {
    expect(camera.at(1000, 2)).toEqual({ x: 750, y: 500, scale: 0.5 });
    const far = camera.at(0, 100);
    expect(far.y).toBeCloseTo(206);
    expect(far.x).toBeCloseTo(495);
  });

  it("draws a strip's lines to its own vanishing point", () => {
    // An octave centred at x 200: its middle stays put, its edges close in on it.
    expect(camera.at(200, 4, 200).x).toBe(200);
    expect(camera.at(300, 4, 200).x).toBe(225);
  });

  it("spaces depth evenly on the floor", () => {
    expect(depthBetween(12, 2, 0.5)).toBe(7);
  });
});
