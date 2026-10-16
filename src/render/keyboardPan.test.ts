import { describe, expect, it } from "vitest";

import { easePan, panAfterResize, panToShow } from "./keyboardPan";

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

describe("panAfterResize", () => {
  it.each([0, -80, 120])(
    "preserves a centre offset of %ipx through 1920 to 1280 and back",
    (offset) => {
      const large = { width: 1920, total: 2288 };
      const small = { width: 1280, total: 2288 };
      const pan = 184 + offset;
      const resized = panAfterResize(pan, large, small);
      expect(resized).toBe(504 + offset);
      expect(panAfterResize(resized, small, large)).toBe(pan);
    }
  );

  it.each([
    [0, 0],
    [1008, 368]
  ])("clamps edge pan %ipx immediately when widening the viewport", (pan, expected) => {
    const reframed = panAfterResize(
      pan,
      { width: 1280, total: 2288 },
      { width: 1920, total: 2288 }
    );
    expect(reframed).toBe(expected);
    // The first eased frame must also stay within both keyboard edges.
    const nextFrame = easePan(reframed, expected === 0 ? 368 : 0, 0.016, 0.35);
    expect(nextFrame).toBeGreaterThanOrEqual(0);
    expect(nextFrame).toBeLessThanOrEqual(368);
  });

  it("centres a keyboard narrower than the viewport with a negative pan", () => {
    expect(panAfterResize(0, { width: 1280, total: 1500 }, { width: 1920, total: 1500 })).toBe(
      -210
    );
  });

  it("preserves the scroll through responsive changes in key width", () => {
    expect(panAfterResize(184, { width: 1920, total: 2288 }, { width: 768, total: 1664 })).toBe(
      448
    );
  });
});
