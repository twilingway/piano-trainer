import { describe, expect, it } from "vitest";

import { sharedReaderSpacing } from "./sharedReaderSpacing";

describe("shared reader engraving spacing", () => {
  it("leaves room for Russian labels while keeping standalone and Latin engraving unchanged", () => {
    expect(sharedReaderSpacing(0.65, "ru")).toBeCloseTo(2.6);
    expect(sharedReaderSpacing(0.65, "en")).toBe(0.65);
    expect(sharedReaderSpacing(0.65, "off")).toBe(0.65);
    expect(sharedReaderSpacing(0.65, undefined)).toBe(0.65);
  });
});
