import { describe, expect, it } from "vitest";
import { handSurface } from "./handProjection";

const geometry = { keyboardTop: 200, keyboardHeight: 160, blackHeight: 100, whiteWidth: 44 };

describe("handSurface", () => {
  it("places hints above the white and raised black key surfaces", () => {
    expect(handSurface(geometry, 327, 0).height).toBe(23);
    expect(handSurface(geometry, 327, 0).depth).toBeCloseTo(78.1);
    expect(handSurface(geometry, 272, 1).height).toBe(37);
    expect(handSurface(geometry, 272, 1).depth).toBeCloseTo(80.8);
  });

  it("puts the whole hand over white keys and lets the wrist extend past their fronts", () => {
    expect(handSurface(geometry, 600).height).toBeGreaterThan(22);
    expect(handSurface(geometry, 600).depth).toBeLessThan(0);
    expect(handSurface(geometry, 327).depth).toBeCloseTo(78.1);
    expect(handSurface(geometry, 427).depth).toBeCloseTo(28.1);
  });

  it("remains finite when the viewport leaves no space for keys", () => {
    const empty = { ...geometry, keyboardHeight: 0, blackHeight: 0 };
    expect(Number.isFinite(handSurface(empty, 200, 1).depth)).toBe(true);
  });
});
