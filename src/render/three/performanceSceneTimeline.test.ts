import { describe, expect, it } from "vitest";
import { performanceSceneTimeline as timeline } from "./performanceSceneTimeline";
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
