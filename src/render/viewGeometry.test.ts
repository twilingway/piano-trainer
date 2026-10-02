import { describe, expect, it } from "vitest";

import { layoutKeyboard, whiteKeysBetween } from "./keyboardLayout";
import { fitRange, viewGeometry } from "./viewGeometry";

const ALL = { notes: true, keys: true, hands: false };
const WHITE_WIDTH = 44;

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
  it.each([320, 667, 768, 2000])(
    "keeps fixed bounds and 44px white keys on a %ipx viewport",
    (width) => {
      const fitted = fitRange(width, 60, 72, false);
      expect(fitted).toEqual({ low: 60, high: 72, total: 8 * WHITE_WIDTH });
      for (const key of layoutKeyboard(fitted.total, fitted.low, fitted.high).values()) {
        expect(key.width).toBeCloseTo(key.black ? WHITE_WIDTH * 0.6 : WHITE_WIDTH);
      }
    }
  );

  it.each([320, 667, 768, 2000])(
    "widens a short song to fill a %ipx viewport without stretching",
    (width) => {
      const fitted = fitRange(width, 60, 72, true);
      expect(fitted.low).toBeLessThanOrEqual(60);
      expect(fitted.high).toBeGreaterThanOrEqual(72);
      expect(fitted.total).toBeGreaterThanOrEqual(width);
      expect(fitted.total).toBe(Math.max(8, Math.ceil(width / WHITE_WIDTH)) * WHITE_WIDTH);
      for (const key of layoutKeyboard(fitted.total, fitted.low, fitted.high).values()) {
        expect(key.width).toBeCloseTo(key.black ? WHITE_WIDTH * 0.6 : WHITE_WIDTH);
      }
    }
  );

  it.each([320, 667, 768, 2000, 4000, 6000])(
    "caps a wide song at 88 fixed-size keys on a %ipx viewport",
    (width) => {
      const fitted = fitRange(width, 21, 108, true, true);
      expect(fitted).toEqual({ low: 21, high: 108, total: 52 * WHITE_WIDTH });
      const keys = layoutKeyboard(fitted.total, fitted.low, fitted.high);
      expect(keys.size).toBe(88);
      for (const key of keys.values()) {
        expect(key.width).toBeCloseTo(key.black ? WHITE_WIDTH * 0.6 : WHITE_WIDTH);
      }
    }
  );

  it.each([320, 667, 768])(
    "retains a scrollable whole-song keyboard on a compact %ipx screen",
    (width) => {
      const fitted = fitRange(width, 21, 108, true, true);
      const keys = layoutKeyboard(fitted.total, fitted.low, fitted.high);
      expect(keys.size).toBe(88);
      expect(keys.get(21)?.x).toBe(0);
      const last = keys.get(108);
      expect((last?.x ?? 0) + (last?.width ?? 0)).toBeCloseTo(52 * WHITE_WIDTH);
      expect(fitted.total).toBeGreaterThan(width);
      for (const key of keys.values()) {
        expect(key.x).toBeGreaterThanOrEqual(0);
        expect(key.x + key.width).toBeLessThanOrEqual(fitted.total + 1e-9);
        expect(key.width).toBeCloseTo(key.black ? WHITE_WIDTH * 0.6 : WHITE_WIDTH);
      }
    }
  );

  it.each([false, true])("counts white neighbors of black edges in range mode %s", (fitsSong) => {
    const fitted = fitRange(320, 61, 78, fitsSong);
    const keys = layoutKeyboard(fitted.total, fitted.low, fitted.high);
    expect(keys.has(61)).toBe(true);
    expect(keys.has(78)).toBe(true);
    expect(keys.has(60)).toBe(true);
    expect(keys.has(79)).toBe(true);
    expect(fitted.total).toBe(12 * WHITE_WIDTH);
    for (const key of keys.values()) {
      expect(key.x).toBeGreaterThanOrEqual(0);
      expect(key.x + key.width).toBeLessThanOrEqual(fitted.total + 1e-9);
      expect(key.width).toBeCloseTo(key.black ? WHITE_WIDTH * 0.6 : WHITE_WIDTH);
    }
  });

  it("leaves one extra white key on each side of the song in a compact view", () => {
    const fitted = fitRange(667, 48, 79, true, true);
    const keys = layoutKeyboard(fitted.total, fitted.low, fitted.high);
    expect(whiteKeysBetween(fitted.low, 47)).toBe(1);
    expect(whiteKeysBetween(80, fitted.high)).toBe(1);
    expect(keys.get(48)?.x).toBeGreaterThan(0);
    const lastSongKey = keys.get(79);
    expect((lastSongKey?.x ?? 0) + (lastSongKey?.width ?? 0)).toBeLessThan(fitted.total);
  });
});
