import { expect, it } from "vitest";
import { depthAtScreenProgress } from "./perspective";

it("inverts perspective progress without changing the endpoints or direction", () => {
  for (const [near, far] of [
    [100, 1000],
    [900, 2000],
    [500, 500]
  ] as const) {
    expect(depthAtScreenProgress(-1, near, far)).toBe(0);
    expect(depthAtScreenProgress(2, near, far)).toBe(1);
    let previous = 0;
    for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const depth = depthAtScreenProgress(progress, near, far);
      const zoom = 1 / (far + (near - far) * depth);
      const screen = near === far ? depth : (zoom - 1 / far) / (1 / near - 1 / far);
      expect(screen).toBeCloseTo(progress);
      expect(depth).toBeGreaterThanOrEqual(previous);
      previous = depth;
    }
  }
});
