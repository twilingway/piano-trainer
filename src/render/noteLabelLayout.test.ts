import { describe, expect, it } from "vitest";

import { fingerLabelAlpha, fitNoteLabel, noteAxisX, noteLabelInset } from "./noteLabelLayout";

describe("labels inside falling notes", () => {
  it.each([
    [42, 100],
    [42, 22],
    [18, 14],
    [8, 4]
  ])("fits the digit inside a %s by %s block", (width, height) => {
    const inset = noteLabelInset(width, height);
    const scale = fitNoteLabel(width - inset * 2, height - inset * 2, 24, 40, 24);
    expect(24 * scale).toBeLessThanOrEqual(width - inset * 2);
    expect(40 * scale).toBeLessThanOrEqual(height - inset * 2);
    expect(height - inset - 40 * scale).toBeGreaterThanOrEqual(inset - 1e-9);
  });

  it("hides a name that cannot fit over the digit instead of crossing the rim", () => {
    expect(fitNoteLabel(34, 4, 52, 22, 16)).toBe(0);
    expect(fitNoteLabel(34, 30, 52, 22, 16)).toBeGreaterThan(0);
  });
});

describe("leaning note axis", () => {
  it("follows the note from its near end to its far end", () => {
    // Near end at x 40, y 130; far end 60 rows up at x 100.
    expect(noteAxisX(40, 100, 130, 60, 130)).toBe(40);
    expect(noteAxisX(40, 100, 130, 60, 100)).toBe(70);
    expect(noteAxisX(40, 100, 130, 60, 70)).toBe(100);
    // A label taller than a short note keeps to the same line beyond it.
    expect(noteAxisX(40, 100, 130, 60, 40)).toBe(130);
  });

  it("needs both ends and some height", () => {
    expect(noteAxisX(undefined, 100, 130, 60, 100)).toBeUndefined();
    expect(noteAxisX(40, undefined, 130, 60, 100)).toBeUndefined();
    expect(noteAxisX(40, 100, 130, 0, 100)).toBeUndefined();
  });
});

describe("finger labels on the road", () => {
  it("fade in between three and two seconds before the keys", () => {
    expect(fingerLabelAlpha(10)).toBe(0);
    expect(fingerLabelAlpha(3)).toBe(0);
    expect(fingerLabelAlpha(2.5)).toBeCloseTo(0.5);
    expect(fingerLabelAlpha(2)).toBe(1);
    expect(fingerLabelAlpha(0)).toBe(1);
    // A sounding note keeps its label.
    expect(fingerLabelAlpha(-1)).toBe(1);
  });
});
