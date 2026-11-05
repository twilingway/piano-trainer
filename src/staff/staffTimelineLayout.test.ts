import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";
import { layoutStaffTimeline } from "./staffTimelineLayout";

const entries = [
  { beat: 1, x: 90, line: 40 },
  { beat: 5, x: 290, line: 40 }
];
const axis = { originX: 40, pixelsPerSecond: 100, timeAtBeat: (beat: number) => beat * 0.5 };
const timeline = { beats: [0, 2, 4], timeAtBeat: axis.timeAtBeat };
const sheet = (empty = false) =>
  ({
    Sheet: {
      SourceMeasures: empty
        ? []
        : [
            { AbsoluteTimestamp: { RealValue: 0 }, Duration: { RealValue: 1 } },
            { AbsoluteTimestamp: { RealValue: 1 }, Duration: { RealValue: 1 } }
          ]
    }
  }) as unknown as OpenSheetMusicDisplay;

describe("staff timeline layout composition", () => {
  it("keeps engraved entries untouched when a uniform axis, timeline or measures are absent", () => {
    expect(layoutStaffTimeline(sheet(), undefined, timeline, entries, [])).toBe(entries);
    expect(layoutStaffTimeline(sheet(), axis, undefined, entries, [])).toBe(entries);
    expect(layoutStaffTimeline(sheet(true), axis, timeline, entries, [])).toBe(entries);
  });
  it("retains measure boundaries, tempo boundaries and the musical end on the same time axis", () => {
    const result = layoutStaffTimeline(sheet(), axis, timeline, entries, [
      { top: 40, bottom: 100 }
    ]);
    expect(result.map((entry) => entry.beat)).toEqual([0, 1, 2, 4, 5, 8]);
    expect(result.every((entry) => entry.line === 40)).toBe(true);
    expect(result.find((entry) => entry.beat === 2)?.x).toBe(140);
    expect(result.at(-1)).toEqual({ beat: 8, x: 440, line: 40 });
  });
});
