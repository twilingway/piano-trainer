import { describe, expect, it } from "vitest";
import { spotAt } from "./liveCursor";
import { timelineSpots } from "./staffTimelineSpots";

describe("time-proportional staff anchors", () => {
  it("keeps equal seconds equally spaced across a tempo boundary between heads", () => {
    const timeAtBeat = (beat: number) => (beat <= 2 ? beat : 2 + (beat - 2) / 2);
    const spots = timelineSpots(
      { originX: 100, pixelsPerSecond: 80, timeAtBeat },
      [
        { beat: 0, x: 999, line: 5 },
        { beat: 4, x: 9999, line: 5 }
      ],
      [0, 1, 2, 3, 4],
      0,
      4,
      5
    );
    for (const beat of [0, 0.4, 1.8, 2, 2.2, 3.7, 4]) {
      expect(spotAt(spots, beat)?.x).toBeCloseTo(100 + 80 * timeAtBeat(beat), 8);
    }
    expect((spotAt(spots, 4)?.x ?? 0) - (spotAt(spots, 2)?.x ?? 0)).toBe(80);
    expect((spotAt(spots, 1)?.x ?? 0) - (spotAt(spots, 0)?.x ?? 0)).toBe(80);
  });

  it("uses time boundaries through silence instead of the centred whole-rest glyph", () => {
    const entries = [
      { beat: 0, x: 350, line: 0 },
      { beat: 8, x: 900, line: 0 }
    ];
    const before = structuredClone(entries);
    const spots = timelineSpots(
      { originX: 20, pixelsPerSecond: 100, timeAtBeat: (beat) => beat / 2 },
      entries,
      [-1, 0, 2, 2, 4, 8, 9],
      0,
      8,
      0
    );
    expect(spots.map((spot) => spot.beat)).toEqual([0, 2, 4, 8]);
    expect(spotAt(spots, 0)?.x).toBe(20);
    expect(spotAt(spots, 3)?.x).toBe(170);
    expect(entries).toEqual(before);
  });
});
