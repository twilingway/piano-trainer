import { describe, expect, it } from "vitest";

import { entryBeatAt, spotAt } from "./liveCursor";

// Two notes on the first line, then the next line starts at beat 2.
const SPOTS = [
  { beat: 0, x: 100, line: 0 },
  { beat: 1, x: 200, line: 0 },
  { beat: 2, x: 60, line: 120 }
];

describe("entryBeatAt", () => {
  const entries = [0, 0.25, 2.5, 3, 4].map((beat) => ({ beat, x: beat * 50, line: 0 }));
  it("changes highlights at the exact onset, including fractional and tied entries", () => {
    expect(entryBeatAt(entries, 0.249)).toBe(0);
    expect(entryBeatAt(entries, 0.25)).toBe(0.25);
    expect(entryBeatAt(entries, 2.999)).toBe(2.5);
    expect(entryBeatAt(entries, 3)).toBe(3);
    expect(entryBeatAt(entries, 3.8)).toBe(3);
    expect(entryBeatAt(entries, 4)).toBe(4);
    expect(entryBeatAt(entries, 1)).toBe(0.25);
  });
  it("handles the lead-in, the end and an unavailable score", () => {
    expect(entryBeatAt(entries, -2)).toBe(0);
    expect(entryBeatAt(entries, 8)).toBe(4);
    expect(entryBeatAt([], 0)).toBeUndefined();
    expect(entryBeatAt(entries, NaN)).toBeUndefined();
  });
});

describe("spotAt", () => {
  it("glides between the notes of a line with the beat", () => {
    expect(spotAt(SPOTS, 0.5)).toEqual({ x: 150, line: 0 });
    expect(spotAt(SPOTS, 0.25)?.x).toBe(125);
  });

  it("waits at a line's last note instead of sweeping back across the line", () => {
    expect(spotAt(SPOTS, 1.5)).toEqual({ beat: 1, x: 200, line: 0 });
    expect(spotAt(SPOTS, 2)?.line).toBe(120);
  });

  it("stands on the first note before it and on the last after it", () => {
    expect(spotAt(SPOTS, -1)?.x).toBe(100);
    expect(spotAt(SPOTS, 9)?.x).toBe(60);
    expect(spotAt([], 1)).toBeUndefined();
  });
});
