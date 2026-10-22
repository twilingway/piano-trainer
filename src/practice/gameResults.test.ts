import { describe, expect, it } from "vitest";
import { starsForAccuracy, starsForNoteResult } from "./gameResults";
import { NOTE_RESULT_POLICY, type NoteResultSnapshot } from "./noteResult";

function result(percent: number | null, expectedNotes = 1): NoteResultSnapshot {
  return {
    policy: NOTE_RESULT_POLICY,
    expectedNotes,
    hitNotes: 1,
    hitPercent: 30,
    holdPercent: percent === null ? 0 : percent - 30,
    percent
  };
}

describe("piano result stars", () => {
  it.each([
    [0, 0],
    [24.999, 0],
    [25, 1],
    [49.999, 1],
    [50, 2],
    [74.999, 2],
    [75, 3],
    [85.2, 3],
    [100, 3]
  ])("awards %s percent %s stars without rounding", (percent, stars) => {
    expect(starsForNoteResult(result(percent))).toBe(stars);
  });

  it.each([null, NaN, Infinity, -1, 101])("hides stars for invalid result %s", (percent) => {
    expect(starsForNoteResult(result(percent))).toBeNull();
  });

  it("hides empty exercises and preserves legacy strict attack thresholds", () => {
    expect(starsForNoteResult(result(100, 0))).toBeNull();
    expect([25, 50, 75, 85.2].map(starsForAccuracy)).toEqual([0, 1, 2, 3]);
  });
});
