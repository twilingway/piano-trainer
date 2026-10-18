import { describe, expect, it } from "vitest";
import type { SongBeat } from "../../song/song";
import { performerMotion } from "./performerMotion";

const grid = (times: readonly number[]): SongBeat[] =>
  times.map((time, position) => ({
    time,
    position,
    downbeat: position % 4 === 0
  }));
const beats = grid(Array.from({ length: 17 }, (_, index) => index * 0.5));
const zero = { bodyRoll: 0, headRoll: 0, headYaw: 0, leftFootPitch: 0 };
const rad = Math.PI / 180;

describe("score-driven performer motion", () => {
  it("is neutral without a usable grid or outside the song envelope", () => {
    for (const time of [NaN, Infinity, -Infinity])
      expect(performerMotion(time, beats)).toEqual(zero);
    expect(performerMotion(0, [])).toEqual(zero);
    expect(performerMotion(0, grid([0]))).toEqual(zero);
    expect(performerMotion(0, grid([0, 0]))).toEqual(zero);
    expect(performerMotion(-1, beats)).toEqual(zero);
    expect(performerMotion(9, beats)).toEqual(zero);
  });

  it("samples the same pose on pause, repeated frames and backward seeks without mutating beats", () => {
    const immutable = Object.freeze(beats.map((beat) => Object.freeze({ ...beat })));
    const first = performerMotion(1.91, immutable);
    expect(first.leftFootPitch).toBeGreaterThan(0);
    performerMotion(7.9, immutable);
    expect(performerMotion(1.91, immutable)).toEqual(first);
    expect(performerMotion(1.91, immutable)).toEqual(first);
  });

  it("sways left and right over four beats with gentle continuous head accents and quiet torso", () => {
    const left = performerMotion(0.5, beats);
    const right = performerMotion(1.5, beats);
    expect(left.headRoll).toBeCloseTo(0.9 * rad, 10);
    expect(right.headRoll).toBeCloseTo(-0.9 * rad, 10);
    expect(Math.abs(left.bodyRoll)).toBeLessThan(Math.abs(left.headRoll));
    expect(performerMotion(2.5, beats).headRoll).toBeCloseTo(left.headRoll, 10);
    for (let time = -0.5; time <= 8.5; time += 0.007) {
      const motion = performerMotion(time, beats);
      expect(Math.abs(motion.headRoll)).toBeLessThanOrEqual(0.9 * rad + 1e-12);
      expect(Math.abs(motion.headYaw)).toBeLessThanOrEqual(0.6 * rad + 1e-12);
      expect(Math.abs(motion.bodyRoll)).toBeLessThanOrEqual(0.75 * rad + 1e-12);
      expect(motion.leftFootPitch).toBeGreaterThanOrEqual(0);
      expect(motion.leftFootPitch).toBeLessThanOrEqual(12 * rad + 1e-12);
      Object.values(motion).forEach((value) => {
        expect(Number.isFinite(value)).toBe(true);
      });
    }
  });

  it("lifts before the beat, returns to contact on it and emphasizes supplied downbeats", () => {
    const weak = performerMotion(1.5 - 0.09, beats).leftFootPitch;
    const strong = performerMotion(2 - 0.09, beats).leftFootPitch;
    expect(weak).toBeCloseTo(8 * rad, 10);
    expect(strong).toBeCloseTo(12 * rad, 10);
    expect(performerMotion(1.6, beats).leftFootPitch).toBe(0);
    for (const beat of beats)
      expect(performerMotion(beat.time, beats).leftFootPitch).toBeCloseTo(0, 10);
    const changedMeter = beats.map((beat, index) => ({ ...beat, downbeat: index === 3 }));
    expect(performerMotion(1.41, changedMeter).leftFootPitch).toBeCloseTo(strong, 10);
    expect(performerMotion(1.91, changedMeter).leftFootPitch).toBeCloseTo(weak, 10);
  });

  it("keeps pose and sway speed continuous at tempo changes", () => {
    const changing = grid([0, 0.5, 1, 1.5, 2.5, 3.5, 3.75, 4, 4.25, 4.5, 5]);
    const epsilon = 1e-5;
    for (const time of [1, 1.5, 2.5, 3.5, 3.75, 4]) {
      const before = performerMotion(time - epsilon, changing);
      const at = performerMotion(time, changing);
      const after = performerMotion(time + epsilon, changing);
      for (const key of ["bodyRoll", "headRoll", "headYaw"] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.0001);
        const incoming = (at[key] - before[key]) / epsilon;
        const outgoing = (after[key] - at[key]) / epsilon;
        expect(Math.abs(outgoing - incoming)).toBeLessThan(0.001);
      }
      expect(at.leftFootPitch).toBeCloseTo(0, 10);
    }
  });

  it("eases in and out without a jump at the grid boundaries", () => {
    const epsilon = 1e-5;
    for (const time of [0, 8.5]) {
      const before = performerMotion(time - epsilon, beats);
      const after = performerMotion(time + epsilon, beats);
      for (const key of ["bodyRoll", "headRoll", "headYaw"] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(1e-8);
      }
    }
  });
});

it("keeps the added head sway below four degrees per second on a regular score grid", () => {
  const h = 0.0001;
  for (let time = 0.5; time < 8; time += 0.003) {
    const a = performerMotion(time - h, beats),
      b = performerMotion(time + h, beats);
    expect(Math.hypot(b.headRoll - a.headRoll, b.headYaw - a.headYaw) / (2 * h)).toBeLessThan(
      4 * rad
    );
  }
});
