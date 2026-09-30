import { describe, expect, it } from "vitest";

import { perspectiveMap } from "./perspective";

// A 100×100 picture laid on a road: 20 wide at the horizon (y 40), 100 wide at the bottom.
const map = perspectiveMap(100, 100, [40, 40, 60, 40, 100, 100, 0, 100]);

describe("perspectiveMap", () => {
  it("puts the picture's corners on the quad's corners", () => {
    expect(map(0, 0)).toMatchObject({ x: 40, y: 40 });
    expect(map(100, 0).x).toBeCloseTo(60);
    expect(map(100, 100).x).toBeCloseTo(100);
    expect(map(0, 100).y).toBeCloseTo(100);
  });

  it("keeps the middle on the axis and pulls the half-way line towards the horizon", () => {
    const middle = map(50, 50);
    expect(middle.x).toBeCloseTo(50);
    // The far half is squeezed on screen: half-way down the picture lands nearer the
    // horizon (40) than half-way down the quad (70).
    expect(middle.y).toBeCloseTo(50);
  });

  it("scales things down with distance", () => {
    expect(map(50, 100).scale).toBeCloseTo(1);
    expect(map(50, 0).scale).toBeCloseTo(0.2);
    expect(map(50, 50).scale).toBeGreaterThan(0.2);
  });
});
