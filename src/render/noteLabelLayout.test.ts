import { describe, expect, it } from "vitest";

import { fitNoteLabel, noteLabelInset } from "./noteLabelLayout";

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
