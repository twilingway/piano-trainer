import { describe, expect, it } from "vitest";

import { whiteKeysBetween } from "./keyboardLayout";
import { fitRange, viewGeometry } from "./viewGeometry";

const ALL = { notes: true, keys: true, hands: false };

describe("viewGeometry", () => {
  it("drops the notes to the bottom edge without keys", () => {
    const geometry = viewGeometry(600, 40, { ...ALL, keys: false }, false);
    expect(geometry).toMatchObject({ keyboardTop: 600, hitY: 600, keyboardHeight: 0 });
  });

  it("puts the hit line on top of the felt, the keys a margin off the bottom", () => {
    const geometry = viewGeometry(600, 40, ALL, false);
    // A margin of a fifth of a white key under the keys.
    expect(geometry.keyboardTop + geometry.keyboardHeight).toBe(592);
    expect(geometry.hitY).toBeCloseTo(geometry.keyboardTop - geometry.feltHeight);
  });

  it("keeps the keys' length to their width, within a share of the view", () => {
    expect(viewGeometry(1000, 40, ALL, false).keyboardHeight).toBeCloseTo(144);
    expect(viewGeometry(200, 40, ALL, false).keyboardHeight).toBeCloseTo(120);
  });

  it("keeps the keys' length without the notes, at the bottom of the view", () => {
    const geometry = viewGeometry(1000, 40, { ...ALL, notes: false }, false);
    expect(geometry.keyboardHeight).toBeCloseTo(144);
    expect(geometry.keyboardTop + geometry.keyboardHeight).toBeCloseTo(992);
    // A view too short for them gets all its height to the keys.
    expect(viewGeometry(150, 40, { ...ALL, notes: false }, false).keyboardHeight).toBeCloseTo(
      150 - 8 - 8.8
    );
  });

  it("shortens the black keys for stickers only", () => {
    const plain = viewGeometry(600, 40, ALL, false);
    const stickers = viewGeometry(600, 40, ALL, true);
    expect(stickers.keyboardHeight).toBe(plain.keyboardHeight);
    expect(stickers.blackHeight).toBeLessThan(plain.blackHeight);
  });

  it("leaves a strip under the keys for the palms", () => {
    const geometry = viewGeometry(600, 40, { ...ALL, hands: true }, false);
    expect(geometry.keyboardTop + geometry.keyboardHeight).toBeCloseTo(600 - 120);
  });
});

describe("fitRange", () => {
  it("keeps a fixed range as it is", () => {
    expect(fitRange(2000, 60, 72, false)).toEqual({ low: 60, high: 72, total: 2000 });
  });

  it("adds keys round a short song so none is giant", () => {
    const fitted = fitRange(2000, 60, 72, true);
    expect(fitted.low).toBeLessThan(60);
    expect(fitted.high).toBeGreaterThan(72);
    expect(fitted.total).toBe(2000);
    expect(2000 / whiteKeysBetween(fitted.low, fitted.high)).toBeLessThanOrEqual(90);
  });

  it("scrolls a wide song rather than shrink its keys", () => {
    const fitted = fitRange(500, 21, 108, true);
    expect(fitted).toEqual({ low: 21, high: 108, total: 52 * 56 });
  });
});
