import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";
import { fitWrappedStaff, wrappedStaffScale } from "./fitWrappedStaff";

const measures = (count: number, width: number, perLine: number) =>
  Array.from({ length: count }, (_, index) => ({
    width,
    startsLine: index > 0 && index % perLine === 0
  }));

describe("wrappedStaffScale", () => {
  it("fits the complete eight-bar XML group instead of accepting natural two-bar wraps", () => {
    const scale = wrappedStaffScale(measures(16, 65, 8), 140, 10);
    expect(scale).toBeGreaterThan(0);
    expect((8 * 65 + 10) * scale).toBeLessThanOrEqual(140);
  });

  it("keeps a fitting two-bar layout at the chosen zoom", () => {
    expect(wrappedStaffScale(measures(16, 65, 2), 140, 10)).toBe(1);
  });

  it("uses the widest requested group including a pickup, not the entire score", () => {
    const bars = measures(17, 50, 8).map((measure, index) => ({
      ...measure,
      startsLine: index === 9
    }));
    expect(wrappedStaffScale(bars, 400, 10)).toBeCloseTo((400 / 460) * 0.98);
  });

  it("preserves empty or not-yet-sized pages", () => {
    expect(wrappedStaffScale([], 140, 10)).toBe(1);
    expect(wrappedStaffScale(measures(8, 65, 8), 0, 10)).toBe(1);
  });
});

describe("fitWrappedStaff", () => {
  const measure = (width: number, startsLine = false) => ({
    PositionAndShape: { Size: { width } },
    parentSourceMeasure: { printNewSystemXml: startsLine }
  });
  const display = (rows: unknown[][]) => ({
    Zoom: 1,
    GraphicSheet: {
      MusicPages: [{ PositionAndShape: { Size: { width: 140 } } }],
      MeasureList: rows
    },
    EngravingRules: { PageLeftMargin: 5, PageRightMargin: 5 },
    render: vi.fn()
  });

  it("fits the visible staff when another staff is explicitly absent", () => {
    const visible = measure(200);
    const osmd = display([[undefined, visible]]);
    osmd.render.mockImplementation(() => {
      visible.PositionAndShape.Size.width = 100;
    });
    fitWrappedStaff(osmd as unknown as OpenSheetMusicDisplay);
    expect(osmd.Zoom).toBeCloseTo((140 / 210) * 0.98);
    expect(osmd.render).toHaveBeenCalledOnce();
  });

  it("reads line breaks from the first existing staff and ignores sparse holes", () => {
    const first: unknown[] = [];
    first[2] = measure(80);
    const second: unknown[] = [];
    second[1] = measure(80, true);
    const osmd = display([first, second, new Array<unknown>(2)]);
    fitWrappedStaff(osmd as unknown as OpenSheetMusicDisplay);
    expect(osmd.Zoom).toBe(1);
    expect(osmd.render).not.toHaveBeenCalled();
  });
});
