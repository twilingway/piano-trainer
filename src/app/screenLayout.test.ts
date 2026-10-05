// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SCREEN_LAYOUT,
  DEFAULT_SCREEN_LAYOUTS,
  loadScreenLayouts,
  normalizeLayout,
  saveScreenLayouts,
  startEditing
} from "./screenLayout";

describe("screen layout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("opens for editing on the first start only", () => {
    expect(startEditing()).toBe(true);
    expect(startEditing()).toBe(false);
  });

  it("stays clean when the storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      }
    });
    expect(startEditing()).toBe(false);
  });

  it("falls back on a broken save", () => {
    localStorage.setItem("screen-layout", "{not json");
    expect(loadScreenLayouts()).toEqual(DEFAULT_SCREEN_LAYOUTS);
    expect(normalizeLayout({ keysLift: "high", keysScale: Number.NaN })).toEqual(
      DEFAULT_SCREEN_LAYOUT
    );
  });

  it("pulls values out of range back in", () => {
    expect(
      normalizeLayout({ staffShare: 5, keysLift: -1, keysScale: 9, tickerGap: 5000, laneTop: 2 })
    ).toEqual({
      ...DEFAULT_SCREEN_LAYOUT,
      staffShare: 0.8,
      keysLift: 0,
      keysScale: 1.8,
      tickerGap: 2000,
      laneTop: 0.5
    });
  });

  it("falls back on each mode's own defaults", () => {
    localStorage.setItem("screen-layout", JSON.stringify({ typing: { keysY: "low" } }));
    const layouts = loadScreenLayouts();
    expect(layouts.typing).toEqual(DEFAULT_SCREEN_LAYOUTS.typing);
    expect(layouts.typing.keysY).not.toBe(layouts.piano.keysY);
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
