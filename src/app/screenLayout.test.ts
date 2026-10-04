// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SCREEN_LAYOUT,
  loadScreenLayouts,
  normalizeLayout,
  saveScreenLayouts
} from "./screenLayout";

describe("screen layout", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("falls back on a broken save", () => {
    localStorage.setItem("screen-layout", "{not json");
    expect(loadScreenLayouts()).toEqual({
      piano: DEFAULT_SCREEN_LAYOUT,
      typing: DEFAULT_SCREEN_LAYOUT
    });
    expect(normalizeLayout({ keysLift: "high", keysScale: Number.NaN })).toEqual(
      DEFAULT_SCREEN_LAYOUT
    );
  });

  it("pulls values out of range back in", () => {
    expect(normalizeLayout({ staffShare: 5, keysLift: -1, keysScale: 9, tickerGap: 1000 })).toEqual(
      { staffShare: 0.8, keysLift: 0, keysScale: 1.8, tickerGap: 400 }
    );
  });

  it("keeps each mode's layout apart", () => {
    saveScreenLayouts({
      piano: DEFAULT_SCREEN_LAYOUT,
      typing: { ...DEFAULT_SCREEN_LAYOUT, keysLift: 0.2 }
    });
    const layouts = loadScreenLayouts();
    expect(layouts.typing.keysLift).toBe(0.2);
    expect(layouts.piano.keysLift).toBe(0);
  });
});
