import { describe, expect, it } from "vitest";
import { sharedTabsExtent } from "./pianoTabsExtent";
import type { TabRow } from "./pianoTabsLayout";

function row(width: number, cursorX: readonly number[]): TabRow {
  return {
    startBeat: 0,
    endBeat: 4,
    width,
    boundaries: [0, 4],
    offsets: [0, width],
    events: [],
    cursorSpots: cursorX.map((x, beat) => ({ x, beat, line: 0 }))
  };
}

describe("shared tab scroll extent", () => {
  it("reaches the recorded fractional final anchor with different reader viewport widths", () => {
    const rows = [row(528.497, [0, 546.46])];
    const snapshot = structuredClone(rows);
    const extent = sharedTabsExtent(rows, { svgOffsetX: 712.5, viewportWidth: 1425 }, 1440, true);
    expect(extent.paddingRight).toBeCloseTo(745.463);
    expect(extent.width).toBe(1987);
    const desired = 712.5 + 546.46 - 1425 / 2;
    expect(extent.width - 1440).toBeGreaterThanOrEqual(desired);
    expect(rows).toEqual(snapshot);
  });
  it("uses the furthest finite anchor across rows and reserves no extra wrapped tail", () => {
    const rows = [row(300, [400]), row(500, [800, NaN, Infinity])];
    expect(sharedTabsExtent(rows, { svgOffsetX: 100, viewportWidth: 200 }, 320, true)).toEqual({
      width: 1120,
      paddingLeft: 100,
      paddingRight: 520
    });
    expect(sharedTabsExtent(rows, { svgOffsetX: 100, viewportWidth: 200 }, 320, false)).toEqual({
      width: 600,
      paddingLeft: 100,
      paddingRight: 0
    });
  });
  it("does not add overhang when all anchors are inside the musical row", () => {
    expect(
      sharedTabsExtent([row(700, [0, 600])], { svgOffsetX: 200, viewportWidth: 400 }, 390, true)
    ).toEqual({ width: 1090, paddingLeft: 200, paddingRight: 190 });
  });
});
