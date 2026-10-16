import { describe, expect, it } from "vitest";
import { fittedTimelineZoom } from "./fitStaffTimeline";

describe("horizontal timeline fitting", () => {
  it("shows several bars of a dense piece while preserving symbol proportions", () => {
    const zoom = fittedTimelineZoom(1, 337.46, 1);
    expect(337.46 * zoom).toBeCloseTo(210);
    expect(zoom).toBeGreaterThanOrEqual(0.6);
  });
  it("preserves a readable floor for extreme density and respects the requested size", () => {
    expect(fittedTimelineZoom(1, 2000, 1)).toBe(0.6);
    expect(fittedTimelineZoom(2, 2000, 2)).toBe(1.2);
  });
  it("does not shrink an already compact phone or a sparse score", () => {
    expect(fittedTimelineZoom(0.62, 209, 1)).toBe(0.62);
    expect(fittedTimelineZoom(1, 90, 1)).toBe(1);
  });
});
