import { describe, expect, it } from "vitest";

import type { ScorePlacement, StaffClef } from "../song/scorePlacement";
import { createStaffRoadLayout, staffRoadX } from "./staffRoadGeometry";

const placement = (clef: StaffClef, position: number, accidental = ""): ScorePlacement => ({
  clef,
  position,
  accidental
});

describe("createStaffRoadLayout", () => {
  it("draws two sets of five lines, with equal diatonic steps on both staves", () => {
    const layout = createStaffRoadLayout([], 960);
    expect(layout.lines).toHaveLength(10);
    for (let i = 0; i < 4; i++) {
      expect((layout.lines[i + 1] ?? 0) - (layout.lines[i] ?? 0)).toBeCloseTo(layout.step * 2);
      expect((layout.lines[i + 6] ?? 0) - (layout.lines[i + 5] ?? 0)).toBeCloseTo(layout.step * 2);
    }
    for (const clef of ["bass", "treble"] as const) {
      expect(layout.x(placement(clef, 5)) - layout.x(placement(clef, 4))).toBeCloseTo(layout.step);
      expect(layout.center(clef)).toBe(layout.x(placement(clef, 4)));
    }
    expect(layout.lines[4]).toBeLessThan(layout.lines[5] ?? 0);
  });

  it("fits full written ranges without folding or unequal scales", () => {
    const notes = [
      placement("bass", -20),
      placement("bass", 17),
      placement("treble", -3),
      placement("treble", 25)
    ] as const;
    const layout = createStaffRoadLayout(notes, 420);
    for (const value of notes) {
      expect(layout.x(value)).toBeGreaterThan(0);
      expect(layout.x(value)).toBeLessThan(420);
    }
    expect(layout.x(notes[1]) - layout.x(notes[0])).toBeCloseTo(37 * layout.step);
    expect(layout.x(notes[3]) - layout.x(notes[2])).toBeCloseTo(28 * layout.step);
    expect(layout.x(notes[1])).toBeLessThan(layout.x(notes[2]));
  });

  it("keeps accidentals in place and scales all positions equally after resize", () => {
    const notes = [placement("treble", -2, "♯"), placement("treble", -2, "♭")] as const;
    const small = createStaffRoadLayout(notes, 360);
    const large = createStaffRoadLayout(notes, 720);
    expect(small.x(notes[0])).toBe(small.x(notes[1]));
    expect(large.x(notes[0])).toBe(small.x(notes[0]) * 2);
    expect(large.step).toBe(small.step * 2);
  });
});

describe("staffRoadX", () => {
  it("preserves staff positions for most of the road and lands exactly on the correct key", () => {
    expect(staffRoadX(100, 360, 0)).toBe(100);
    expect(staffRoadX(100, 360, 0.78)).toBe(100);
    expect(staffRoadX(100, 360, 0.89)).toBeCloseTo(230);
    expect(staffRoadX(100, 360, 1)).toBe(360);
    expect(staffRoadX(100, 360, -1)).toBe(100);
    expect(staffRoadX(100, 360, 2)).toBe(360);
  });

  it("smoothly separates altered notes only when approaching their distinct keys", () => {
    expect(staffRoadX(100, 160, 0.5)).toBe(staffRoadX(100, 180, 0.5));
    expect(staffRoadX(100, 160, 0.9)).toBeLessThan(staffRoadX(100, 180, 0.9));
    expect(staffRoadX(100, 160, 0.78001) - 100).toBeLessThan(0.00001);
    expect(160 - staffRoadX(100, 160, 0.99999)).toBeLessThan(0.00001);
  });
});
