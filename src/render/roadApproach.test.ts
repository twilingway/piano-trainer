import { describe, expect, it } from "vitest";
import { roadApproach } from "./roadApproach";

describe("independent road travel profiles", () => {
  it("keeps overhead and perspective approaches independent of musical lookahead", () => {
    for (const lookAhead of [1, 2, 5]) {
      for (const pitch of [80, 85, 90]) expect(roadApproach(lookAhead, true, pitch)).toBe(2.22);
      for (const pitch of [-5, 25, 42, 72, 79.99])
        expect(roadApproach(lookAhead, true, pitch)).toBe(6);
    }
  });

  it("retains the existing preview for classic road and computer-keyboard views", () => {
    for (const pitch of [25, 80, 90]) {
      expect(roadApproach(1, false, pitch)).toBe(4);
      expect(roadApproach(2, false, pitch)).toBe(8);
    }
  });
});
