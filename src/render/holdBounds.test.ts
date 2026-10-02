import { describe, expect, it } from "vitest";
import { holdBounds } from "./holdBounds";

describe("duration above the hit line", () => {
  it("preserves full length before the hit and shrinks only with song time", () => {
    expect(holdBounds(4, 2, 3, 4, 400)).toEqual({ top: 100, bottom: 300 });
    expect(holdBounds(4, 2, 4, 4, 400)).toEqual({ top: 200, bottom: 400 });
    expect(holdBounds(4, 2, 5, 4, 400)).toEqual({ top: 300, bottom: 400 });
    expect(holdBounds(4, 2, 6, 4, 400)).toEqual({ top: 400, bottom: 400 });
  });
  it("clips the tail at the horizon without changing duration ratios", () => {
    expect(holdBounds(4, 8, 1, 4, 400)).toEqual({ top: 0, bottom: 100 });
    expect(holdBounds(4, 1, 3, 4, 400)).toEqual({ top: 200, bottom: 300 });
  });
});
