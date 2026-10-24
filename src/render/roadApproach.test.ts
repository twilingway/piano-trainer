import { describe, expect, it } from "vitest";
import { roadApproach } from "./roadApproach";

describe("shared visual travel profiles", () => {
  it("keeps the accepted direct and perspective previews independent of the keyboard style", () => {
    expect(roadApproach(false)).toBe(2.22);
    expect(roadApproach(true)).toBe(6);
  });
});
