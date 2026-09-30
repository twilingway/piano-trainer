import { describe, expect, it } from "vitest";

import { easePan, panToShow } from "./keyboardPan";

// A keyboard 3000 px wide seen through a 1000 px view, 50 px of margin.
const show = (current: number, spans: { left: number; right: number }[]) =>
  panToShow(current, spans, 1000, 3000, 50);

describe("panToShow", () => {
  it("stays put while the next keys are on screen", () => {
    expect(show(500, [{ left: 900, right: 960 }])).toBe(500);
  });

  it("moves only as far as needed to bring a key in", () => {
    expect(show(500, [{ left: 1600, right: 1660 }])).toBe(710);
    expect(show(500, [{ left: 300, right: 360 }])).toBe(250);
  });

  it("takes as many coming keys as fit, then stops", () => {
    // The first two fit together; the third would not, so it waits its turn.
    const spans = [
      { left: 1200, right: 1260 },
      { left: 1700, right: 1760 },
      { left: 2600, right: 2660 }
    ];
    expect(show(500, spans)).toBe(810);
  });

  it("centres on keys wider than the view and never passes the ends", () => {
    expect(show(0, [{ left: 1000, right: 2200 }])).toBe(1100);
    expect(show(500, [{ left: 2950, right: 3000 }])).toBe(2000);
    expect(show(500, [{ left: 0, right: 40 }])).toBe(0);
    expect(show(1234, [])).toBe(1234);
  });
});

describe("easePan", () => {
  it("covers the same ground in two half frames as in one", () => {
    const once = easePan(0, 100, 0.1, 0.35);
    expect(easePan(easePan(0, 100, 0.05, 0.35), 100, 0.05, 0.35)).toBeCloseTo(once, 9);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(100);
  });
});
