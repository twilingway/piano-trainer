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

  it("follows compact attack knots continuously through a tempo change inside a barline gutter", () => {
    const timeAtBeat = (beat: number) => (beat <= 3.75 ? beat / 2 : 1.875 + beat - 3.75);
    const xAtBeat = (beat: number) =>
      beat <= 3.5
        ? 20 + 72 * timeAtBeat(beat)
        : beat <= 4
          ? 146 + ((timeAtBeat(beat) - 1.75) * 44) / 0.375
          : 190 + (timeAtBeat(beat) - 2.125) * 72;
    const spots = timelineSpots(
      { originX: 20, pixelsPerSecond: 72, timeAtBeat, xAtBeat, breakBeats: [0, 3.5, 4, 8] },
      [],
      [3.75],
      0,
      8,
      0
    );
    expect(spots.map((spot) => spot.beat)).toEqual([0, 3.5, 3.75, 4, 8]);
    for (const beat of [0, 3.4, 3.6, 3.749, 3.75, 3.9, 3.999, 4, 5, 8]) {
      expect(spotAt(spots, beat)?.x).toBeCloseTo(xAtBeat(beat), 8);
    }
    expect(Math.abs((spotAt(spots, 4 - 1e-7)?.x ?? 0) - (spotAt(spots, 4)?.x ?? 0))).toBeLessThan(
      0.001
    );
  });
});
