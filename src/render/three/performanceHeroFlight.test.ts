import { describe, it, expect } from "vitest";
import { performanceHeroFlight } from "./performanceHeroFlight";
import { point, segmentBlocked } from "./performanceCameraMath";
const flight = {
  start: point(-650, 37, 140),
  end: point(650, 37, 140),
  targetStart: point(0, 92, 30),
  targetEnd: point(0, 92, 30),
  underHands: true
};
describe("actual hero entry corridor", () => {
  it("enters from the flank below hands, then rises above the keyboard toward the centre road", () => {
    const obstacles = [
        { min: point(-200, 200, 150), max: point(200, 900, 480) },
        { min: point(-650, -600, -200), max: point(650, 50, 0) }
      ],
      entry = point(0, 245, -458),
      plan = performanceHeroFlight(flight, entry, 1, obstacles, 12);
    if (!plan) throw new Error("Missing clear corridor");
    expect(plan.underHands).toBe(true);
    expect(plan.under.x).toBe(0);
    for (const [a, b] of [
      [plan.approach, plan.entrance],
      [plan.entrance, plan.under],
      [plan.under, entry]
    ] as const)
      for (const box of obstacles) expect(segmentBlocked(a, b, box, 12)).toBe(false);
  });
  it("uses a neighbouring real opening when the central arm blocks the rising segment", () => {
    const obstacle = { min: point(-10, 70, 70), max: point(10, 110, 120) },
      entry = point(0, 245, -458),
      plan = performanceHeroFlight(flight, entry, 1, [obstacle], 12);
    expect(plan?.under.x).not.toBe(0);
    if (!plan) throw new Error("Missing side opening");
    expect(segmentBlocked(plan.under, entry, obstacle, 12)).toBe(false);
  });
  it("does not invent an under-hand passage through a closed mesh", () => {
    const closed = { min: point(-1000, -1000, -1000), max: point(1000, 1000, 1000) };
    expect(performanceHeroFlight(flight, point(0, 245, -458), 1, [closed], 12)).toBeUndefined();
  });
});
