import { describe, expect, it } from "vitest";
import {
  EMBER_LIFE_S,
  emberAt,
  emberLifetime,
  emberSizeForDuration,
  emberRateForHold
} from "./emberMotion";

describe("emberAt", () => {
  it("reproduces the same trajectory from its seed", () => {
    expect(emberAt(42, 1, 800, 24)).toEqual(emberAt(42, 1, 800, 24));
    expect(emberAt(42, 1, 800, 24)).not.toEqual(emberAt(43, 1, 800, 24));
    expect(emberAt(42, 0, 800, 24)).toMatchObject({ x: 0, alpha: 0, alive: true });
    expect(emberAt(42, 0, 800, 24).y).toBeCloseTo(0);
  });

  it("travels upwards, fades and expires within the lifetime bound", () => {
    const early = emberAt(42, 0.2, 800, 24);
    const late = emberAt(42, 1.3, 800, 24);
    expect(late.y).toBeLessThan(early.y);
    expect(late.alpha).toBeGreaterThan(0);
    expect(late.scale).toBeGreaterThan(0.3);
    expect(late.alive).toBe(true);
    for (let seed = 0; seed < 100; seed++) {
      expect(emberAt(seed, EMBER_LIFE_S, 800, 24)).toMatchObject({ alive: false, alpha: 0 });
    }
    expect(emberAt(42, -0.1, 800, 24)).toMatchObject({ alive: false, alpha: 0 });
  });

  it("lets some embers reach the upper screen and scales trajectories with the lane", () => {
    let highest = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (const age of [5, 6, 7, 8]) {
        const point = emberAt(seed, age, 800, 24);
        if (point.alive) highest = Math.max(highest, -point.y);
      }
    }
    expect(highest).toBeGreaterThan(800 * 0.8);
    const full = emberAt(42, 1, 800, 24);
    const half = emberAt(42, 1, 400, 12);
    expect(half.y).toBeCloseTo(full.y / 2);
    expect(half.x).toBeCloseTo(full.x / 2);
    expect(half.alpha).toBe(full.alpha);
  });

  it("reaches the top while still bright and keeps its core visible through most of the climb", () => {
    let highVisible = 0;
    for (let seed = 0; seed < 64; seed++) {
      const lifetime = emberLifetime(seed);
      expect(lifetime).toBeGreaterThanOrEqual(7);
      expect(lifetime).toBeLessThanOrEqual(11);
      const high = emberAt(seed, lifetime * 0.75, 800, 24);
      if (-high.y > 800 * 0.9 && high.alpha >= 0.25) highVisible++;
      const initial = emberAt(seed, 0, 800, 24);
      const sustained = emberAt(seed, lifetime * 0.6, 800, 24);
      expect(sustained.alpha).toBeGreaterThanOrEqual(0.08);
      expect(sustained.alpha).toBeLessThanOrEqual(1);
      expect(sustained.scale / initial.scale).toBeGreaterThanOrEqual(0.7);
      expect(emberAt(seed, lifetime * 0.95, 800, 24).alpha).toBeLessThan(sustained.alpha);
      expect(emberAt(seed, lifetime, 800, 24)).toMatchObject({ alive: false, alpha: 0 });
    }
    expect(highVisible).toBeGreaterThan(4);
  });

  it("rises slowly and sways back and forth without hard blinking", () => {
    let reversing = 0;
    for (let seed = 0; seed < 64; seed++) {
      expect(-emberAt(seed, 1, 800, 24).y).toBeLessThan(800 * 0.25);
      let previous = emberAt(seed, 0, 800, 24);
      let previousDirection = 0;
      let reversed = false;
      const life = emberLifetime(seed);
      for (let age = 0.05; age < life; age += 0.05) {
        const point = emberAt(seed, age, 800, 24);
        const direction = Math.sign(point.x - previous.x);
        if (previousDirection !== 0 && direction !== 0 && direction !== previousDirection)
          reversed = true;
        expect(Math.abs(point.alpha - previous.alpha)).toBeLessThan(0.1);
        expect(point.y).toBeLessThan(previous.y + 1);
        previousDirection = direction;
        previous = point;
      }
      if (reversed) reversing++;
    }
    expect(reversing).toBeGreaterThan(48);
  });

  it("sizes long-note embers larger while bounding duration scaling", () => {
    expect(emberSizeForDuration(4)).toBeGreaterThan(emberSizeForDuration(0.5));
    let previous = 0;
    for (const duration of [-5, 0, 0.5, 1, 4, 100, Infinity]) {
      const size = emberSizeForDuration(duration);
      expect(size).toBeGreaterThanOrEqual(0.85);
      expect(size).toBeLessThanOrEqual(1.35);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
    expect(emberSizeForDuration(NaN)).toBe(emberSizeForDuration(1));
  });

  it("increases emission with time already played and bounds the held-note rate", () => {
    expect(emberRateForHold(0)).toBe(2);
    expect(emberRateForHold(4)).toBeGreaterThan(emberRateForHold(0.5));
    let previous = 0;
    for (const held of [-1, 0, 0.5, 1, 2, 4, 8, 100, Infinity]) {
      const rate = emberRateForHold(held);
      expect(rate).toBeGreaterThanOrEqual(2);
      expect(rate).toBeLessThanOrEqual(6);
      expect(rate).toBeGreaterThanOrEqual(previous);
      previous = rate;
    }
    expect(emberRateForHold(NaN)).toBe(2);
  });

  it("fills a supplied position object without allocating a new result", () => {
    const result = { x: 0, y: 0, alpha: 0, scale: 0, alive: false, rotation: 0, axisScale: 1 };
    expect(emberAt(42, 1, 800, 24, result)).toBe(result);
    expect(result).toEqual(emberAt(42, 1, 800, 24));
  });

  it("turns musical glyphs around their axis while spiraling upward", () => {
    const first = emberAt(42, 1, 800, 120);
    const later = emberAt(42, 3, 800, 120);
    expect(later.rotation).not.toBe(first.rotation);
    expect(later.y).toBeLessThan(first.y);
    expect(later.x).not.toBe(first.x);
    for (let age = 0; age < 7; age += 0.1) {
      const point = emberAt(42, age, 800, 120);
      expect(Math.abs(point.axisScale)).toBeGreaterThanOrEqual(0.2);
      expect(Math.abs(point.axisScale)).toBeLessThanOrEqual(1);
    }
  });

  it("mixes clockwise and counterclockwise spins and softly brightens then dims like a firefly", () => {
    let clockwise = 0;
    let counterclockwise = 0;
    for (let seed = 0; seed < 64; seed++) {
      const start = emberAt(seed, 0, 800, 120);
      const later = emberAt(seed, 1, 800, 120);
      if (later.rotation > start.rotation) clockwise++;
      else counterclockwise++;
    }
    expect(clockwise).toBeGreaterThan(16);
    expect(counterclockwise).toBeGreaterThan(16);
    const brightness = Array.from(
      { length: 80 },
      (_, index) => emberAt(42, 0.5 + index * 0.05, 800, 120).alpha
    );
    expect(Math.max(...brightness) - Math.min(...brightness)).toBeGreaterThan(0.3);
    expect(
      brightness.some((value, index) => index > 0 && value > (brightness[index - 1] ?? value))
    ).toBe(true);
    expect(
      brightness.some((value, index) => index > 0 && value < (brightness[index - 1] ?? value))
    ).toBe(true);
  });
});
