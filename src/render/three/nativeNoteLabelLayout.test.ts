import { describe, expect, it } from "vitest";
import { nativeNoteLabelLayout, type NativeNoteLabelLayout } from "./nativeNoteLabelLayout";

const target = (): NativeNoteLabelLayout => ({
  fingerWidth: 0,
  fingerHeight: 0,
  fingerY: 0,
  nameWidth: 0,
  nameHeight: 0,
  nameY: 0
});

describe("native note caption layout", () => {
  it.each([0.01, 0.1, 4, 20, 200, 2000])(
    "fits both captions inside a projected height of %s",
    (depth) => {
      const out = target();
      nativeNoteLabelLayout(20, depth, 0.6, 2.4, out);
      expect(out.fingerWidth).toBeGreaterThan(0);
      expect(out.nameWidth).toBeGreaterThan(0);
      for (const kind of ["finger", "name"] as const) {
        expect(out[`${kind}Width`]).toBeLessThanOrEqual(20 * 0.82);
        expect(out[`${kind}Y`] + out[`${kind}Height`] / 2).toBeLessThan(depth / 2);
        expect(out[`${kind}Y`] - out[`${kind}Height`] / 2).toBeGreaterThan(-depth / 2);
        expect(out[`${kind}Width`] / out[`${kind}Height`]).toBeCloseTo(
          kind === "finger" ? 0.6 : 2.4
        );
      }
      expect(out.fingerY + out.fingerHeight / 2).toBeLessThan(out.nameY - out.nameHeight / 2);
    }
  );

  it("uses the released finger space for a lone name without leaving an empty slot", () => {
    const both = target();
    const name = target();
    nativeNoteLabelLayout(20, 8, 0.6, 1.2, both);
    nativeNoteLabelLayout(20, 8, 0, 1.2, name);
    expect(name.fingerWidth).toBe(0);
    expect(name.fingerHeight).toBe(0);
    expect(name.nameHeight).toBeGreaterThan(both.nameHeight);
    expect(name.nameY).toBe(0);
  });

  it("removes stale captions when both values disappear", () => {
    const out = target();
    nativeNoteLabelLayout(20, 100, 0.6, 1.2, out);
    nativeNoteLabelLayout(20, 100, 0, 0, out);
    expect(out.fingerWidth + out.fingerHeight + out.nameWidth + out.nameHeight).toBe(0);
  });

  it("keeps upright glyph aspect on a thin perspective lane and caps near-camera text", () => {
    const near = target();
    const edgeOn = target();
    nativeNoteLabelLayout(52, 160, 0.55, 1.4, edgeOn);
    expect(edgeOn.nameHeight).toBeGreaterThan(20);
    expect(edgeOn.fingerHeight).toBeGreaterThan(30);
    expect(edgeOn.nameWidth / edgeOn.nameHeight).toBeCloseTo(1.4);
    nativeNoteLabelLayout(1000, 1000, 0.55, 1.4, near);
    expect(near.nameHeight).toBeCloseTo(16 * (128 / 80));
    expect(near.fingerHeight).toBeCloseTo(24 * (128 / 80));
  });

  it.each([
    [0.8, 0.6],
    [-0.8, 0.6],
    [1, 0]
  ])("fits upright rectangles across a slanted route %s/%s", (dx, dy) => {
    const out = target();
    nativeNoteLabelLayout(24, 160, 0.55, 1.4, out, dx, dy);
    const crossFinger = Math.abs(dy) * out.fingerWidth + Math.abs(dx) * out.fingerHeight;
    const crossName = Math.abs(dy) * out.nameWidth + Math.abs(dx) * out.nameHeight;
    expect(crossFinger).toBeLessThanOrEqual(24 * 0.82 + 0.000001);
    expect(crossName).toBeLessThanOrEqual(24 * 0.82 + 0.000001);
    const fingerAlong = Math.abs(dx) * out.fingerWidth + Math.abs(dy) * out.fingerHeight;
    const nameAlong = Math.abs(dx) * out.nameWidth + Math.abs(dy) * out.nameHeight;
    expect(out.fingerY + fingerAlong / 2).toBeLessThan(out.nameY - nameAlong / 2);
    expect(out.nameWidth / out.nameHeight).toBeCloseTo(1.4);
  });
});
