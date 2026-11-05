import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";
import { layoutStaffTimeline } from "./staffTimelineLayout";
import { spotAt } from "./liveCursor";
import { songCourseStaffOffset } from "../songCourse/progressView";

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

it("continues through a final four-beat hold and applies the viewport crop without changing the axis", () => {
  const spots = layoutStaffTimeline(
    sheet(),
    axis,
    timeline,
    [{ beat: 4, x: 999, line: 40 }],
    [{ top: 40, bottom: 100 }],
    -30
  );
  expect(spots.find((spot) => spot.beat === 4)?.x).toBe(210);
  expect(spots.at(-1)).toEqual({ beat: 8, x: 410, line: 40 });
  expect(axis.originX).toBe(40);
});

it.each([0.5, 0.75, 1])(
  "approaches zero continuously on the existing clock at speed %s",
  (speed) => {
    const clampedAxis = { ...axis, xAtBeat: (beat: number) => 40 + Math.max(0, beat) * 50 };
    const result = layoutStaffTimeline(
      sheet(),
      clampedAxis,
      { ...timeline, fromBeat: -4 },
      entries,
      []
    );
    expect(result[0]).toEqual({ beat: -4, x: -160, line: 0 });
    for (const elapsed of [0, 0.1, 0.5, 1, 1.5, 2 / speed - 1e-7, 2 / speed, 2 / speed + 1e-7]) {
      const beat = -4 + elapsed * speed * 2;
      expect(spotAt(result, beat)?.x).toBeCloseTo(40 + beat * 50, 6);
      expect(songCourseStaffOffset(result, beat, 160)).toBeCloseTo(160 - (40 + beat * 50), 6);
    }
    expect(result.at(-1)).toEqual({ beat: 8, x: 440, line: 0 });
    expect(entries[0]?.beat).toBe(1);
    expect(layoutStaffTimeline(sheet(), clampedAxis, timeline, entries, [])[0]?.beat).toBe(0);
  }
);
