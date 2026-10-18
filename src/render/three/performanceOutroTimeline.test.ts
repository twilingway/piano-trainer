import { describe, it, expect } from "vitest";
import { performanceOutroTimeline as outro } from "./performanceOutroTimeline";
describe("session-time performance outro", () => {
  it("dims lights over eight seconds and covers all emissive content over the final four", () => {
    expect(outro(146.5, 154.5)).toEqual({ light: 1, blackout: 0 });
    expect(outro(150.5, 154.5)).toEqual({ light: 0.5, blackout: 0 });
    expect(outro(152.5, 154.5).blackout).toBe(0.5);
    expect(outro(154.5, 154.5)).toEqual({ light: 0, blackout: 1 });
    expect(outro(200, 154.5)).toEqual({ light: 0, blackout: 1 });
  });
  it("is pause/seek deterministic and stays disabled for an unknown duration", () => {
    const frame = outro(152.5, 154.5);
    outro(154.5, 154.5);
    expect(outro(152.5, 154.5)).toEqual(frame);
    expect(outro(0, 154.5)).toEqual({ light: 1, blackout: 0 });
    for (const duration of [Infinity, NaN, 0, -1])
      expect(outro(200, duration)).toEqual({ light: 1, blackout: 0 });
  });
  it("has zero fade velocity at each channel's own boundaries", () => {
    for (const [channel, times] of [
      ["light", [146.5, 154.5]],
      ["blackout", [150.5, 154.5]]
    ] as const)
      for (const time of times)
        expect(
          Math.abs(outro(time - 0.0001, 154.5)[channel] - outro(time + 0.0001, 154.5)[channel])
        ).toBeLessThan(0.000001);
  });
});
