import { describe, expect, it } from "vitest";
import { performerExpression } from "./performerExpression";
const RAD = Math.PI / 180;

describe("deterministic performer expression", () => {
  it("blinks smoothly in irregular three-to-seven-second intervals with occasional doubles", () => {
    const starts: number[] = [],
      ends: number[] = [];
    let prior = 0,
      maximum = 0,
      minimum = 1,
      maxStep = 0;
    for (let time = 0; time < 120; time += 0.002) {
      const blink = performerExpression(time).blink;
      if (blink > 0 && prior === 0) starts.push(time);
      if (blink === 0 && prior > 0) ends.push(time);
      minimum = Math.min(minimum, blink);
      maxStep = Math.max(maxStep, Math.abs(blink - prior));
      maximum = Math.max(maximum, blink);
      prior = blink;
    }
    expect(minimum).toBeGreaterThanOrEqual(0);
    expect(maximum).toBeLessThanOrEqual(1);
    expect(maximum).toBeGreaterThan(0.999);
    expect(maxStep).toBeLessThan(0.05);
    expect(starts[0]).toBeGreaterThanOrEqual(3);
    let doubles = 0;
    const ordinary: number[] = [];
    starts.forEach((time, index) => {
      if (index > 0 && time - (starts[index - 1] ?? 0) < 1) doubles++;
      else ordinary.push(time);
      if (ends[index] !== undefined) expect((ends[index] ?? 0) - time).toBeCloseTo(0.18, 2);
    });
    expect(doubles).toBeGreaterThan(0);
    ordinary.slice(1).forEach((time, index) => {
      const gap = time - (ordinary[index] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(2.998);
      expect(gap).toBeLessThanOrEqual(7.002);
    });
    expect(
      new Set(
        ordinary.slice(1).map((time, index) => Math.round((time - (ordinary[index] ?? 0)) * 10))
      ).size
    ).toBeGreaterThan(3);
  });

  it("freezes on pause and reproduces a sought frame without state or mutated notes", () => {
    const notes = Object.freeze([Object.freeze({ start: 3, duration: 1, pitch: 72 })]);
    const saved = performerExpression(3.25, notes);
    performerExpression(100, notes);
    expect(performerExpression(3.25, notes)).toEqual(saved);
    expect(performerExpression(3.25, notes)).toEqual(saved);
  });

  it("keeps tiny eyes alive without notes and leaves head gaze neutral", () => {
    for (let time = 0; time < 40; time += 0.017) {
      const pose = performerExpression(time);
      expect(pose.gazeYaw).toBe(0);
      expect(pose.gazePitch).toBe(0);
      expect(Math.abs(pose.eyeYaw)).toBeLessThanOrEqual(2 * RAD);
      expect(Math.abs(pose.eyePitch)).toBeLessThanOrEqual(2 * RAD);
    }
    expect(performerExpression(2).eyeYaw).not.toBe(performerExpression(3).eyeYaw);
  });

  it("occasionally tracks the broad register in both directions without note-onset flicker", () => {
    let strongest = 0,
      time = 0;
    for (let t = 0; t < 32; t += 0.05) {
      const pose = performerExpression(t, [{ start: t, duration: 1, pitch: 84 }]);
      if (pose.gazeYaw > strongest) {
        strongest = pose.gazeYaw;
        time = t;
      }
    }
    expect(strongest).toBeGreaterThan(4 * RAD);
    const high = performerExpression(time, [{ start: time, duration: 1, pitch: 84 }]);
    const low = performerExpression(time, [{ start: time, duration: 1, pitch: 36 }]);
    expect(high.gazeYaw).toBeCloseTo(-low.gazeYaw, 10);
    expect(high.gazePitch).toBeLessThan(0);
    const notes = [
      { start: time, duration: 0.1, pitch: 36 },
      { start: time + 0.1, duration: 0.1, pitch: 84 }
    ];
    for (const boundary of [time, time + 0.1, time + 2.13, 8, 16, 0.85, 1.13]) {
      const before = performerExpression(boundary - 1e-6, notes),
        after = performerExpression(boundary + 1e-6, notes);
      for (const key of ["gazeYaw", "gazePitch", "eyeYaw", "eyePitch"] as const)
        expect(Math.abs(after[key] - before[key])).toBeLessThan(1e-5);
    }
    expect(Math.abs(high.gazeYaw)).toBeLessThanOrEqual(12 * RAD);
    expect(Math.abs(high.eyeYaw)).toBeLessThanOrEqual(2 * RAD);
  });

  it("keeps invalid input finite and neutral", () => {
    for (const time of [NaN, Infinity, -Infinity, -1, 1e300])
      expect(Object.values(performerExpression(time)).every((value) => value === 0)).toBe(true);
    const pose = performerExpression(4, [
      { start: NaN, duration: 1, pitch: 60 },
      { start: 4, duration: NaN, pitch: 60 },
      { start: 4, duration: 1, pitch: Infinity }
    ]);
    expect(pose.gazeYaw).toBe(0);
    expect(pose.gazePitch).toBe(0);
    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
  });
});
