import { describe, expect, it } from "vitest";

import { spotAt } from "./liveCursor";

// Two notes on the first line, then the next line starts at beat 2.
const SPOTS = [
  { beat: 0, x: 100, line: 0 },
  { beat: 1, x: 200, line: 0 },
  { beat: 2, x: 60, line: 120 }
];

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
