import { describe, expect, it } from "vitest";
import {
  performanceOpeningClock as clock,
  performanceOpeningSeconds,
  performanceSceneTimeline as timeline
} from "./performanceSceneTimeline";
describe("performance scene song clock", () => {
  it("holds hands through ten seconds and completes the rise at sixteen", () => {
    expect(timeline(0).rise).toBe(0);
    expect(timeline(10).rise).toBe(0);
    expect(timeline(13).rise).toBeCloseTo(0.5);
    expect(timeline(16).rise).toBe(1);
    expect(timeline(16).orbit).toBe(0);
    expect(timeline(10).spotFade).toBe(0);
    expect(timeline(12).spotFade).toBe(0);
    expect(timeline(16).spotFade).toBe(1);
    expect(timeline(14).spotFade).toBeCloseTo(0.5);
    expect(timeline(20).spotFade).toBe(1);
    expect(timeline(22).vertical).toBe(1);
  });
  it("reproduces pause and seeks without accumulated frame time", () => {
    const frame = timeline(29);
    timeline(100);
    expect(timeline(29)).toEqual(frame);
    expect(timeline(4)).toEqual(timeline(0));
    expect(timeline(NaN)).toEqual(timeline(0));
  });
  it("starts orbit with zero velocity", () => {
    expect(timeline(16.001).orbit / 0.001).toBeLessThan(0.001);
    expect(timeline(30).orbit).toBeGreaterThan(timeline(22).orbit);
  });
  it("has a visible soft ignition in300ms then completes before16s without a step", () => {
    expect(timeline(12).spotFade).toBe(0);
    expect(timeline(12.3).spotFade).toBeCloseTo(0.28);
    expect(timeline(13).spotFade).toBeGreaterThan(0.35);
    expect(timeline(15.5).spotFade).toBe(1);
    for (const time of [12, 12.3, 14, 15.5])
      expect(
        Math.abs(timeline(time + 0.0001).spotFade - timeline(time - 0.0001).spotFade)
      ).toBeLessThan(0.000001);
    let previous = 0;
    for (let time = 12; time <= 16; time += 0.001) {
      const fade = timeline(time).spotFade;
      expect(fade).toBeGreaterThanOrEqual(previous);
      expect(fade - previous).toBeLessThan(0.002);
      previous = fade;
    }
  });
});

describe("short-song opening", () => {
  it("is six seconds under a minute and sixteen otherwise", () => {
    expect(performanceOpeningSeconds(25.7)).toBe(6);
    expect(performanceOpeningSeconds(59.9)).toBe(6);
    expect(performanceOpeningSeconds(60)).toBe(16);
    expect(performanceOpeningSeconds(154.5)).toBe(16);
    expect(performanceOpeningSeconds(Infinity)).toBe(16);
    expect(performanceOpeningSeconds(0)).toBe(16);
    expect(performanceOpeningSeconds(NaN)).toBe(16);
  });
  it("keeps the long clock untouched and compresses the short one into six seconds", () => {
    for (const time of [0, 3.3, 10, 12.7, 16, 18.2, 40]) expect(clock(time, 16)).toBe(time);
    expect(clock(0, 6)).toBe(0);
    expect(clock(0.9, 6)).toBeCloseTo(10);
    expect(clock(6, 6)).toBeCloseTo(16);
    expect(timeline(0.9, 6).rise).toBe(0);
    expect(timeline(6, 6).rise).toBe(1);
    expect(timeline(2.6, 6).spotFade).toBeCloseTo(0);
    expect(timeline(6, 6).spotFade).toBe(1);
    expect(timeline(6, 6).orbit).toBe(0);
    expect(timeline(6.001, 6).orbit / 0.001).toBeLessThan(0.001);
    expect(timeline(12, 6).vertical).toBe(1);
    expect(timeline(6, 6).vertical).toBe(0);
  });
  it("rises and lights without a step", () => {
    let previous = timeline(0, 6);
    for (let time = 0.001; time <= 8; time += 0.001) {
      const frame = timeline(time, 6);
      expect(frame.rise).toBeGreaterThanOrEqual(previous.rise);
      expect(frame.rise - previous.rise).toBeLessThan(0.002);
      expect(frame.spotFade - previous.spotFade).toBeLessThan(0.006);
      previous = frame;
    }
  });
});
