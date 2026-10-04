import { describe, expect, it } from "vitest";
import { FINGER_COLOR, TYPING_FINGER_COLOR } from "./fingerColors";

describe("TYPING_FINGER_COLOR", () => {
  it("tells the hands apart by the index finger only", () => {
    expect(TYPING_FINGER_COLOR.left[2]).toBe(FINGER_COLOR[4]);
    expect(TYPING_FINGER_COLOR.right[2]).toBe(FINGER_COLOR[2]);
    for (const finger of [3, 4, 5] as const) {
      expect(TYPING_FINGER_COLOR.left[finger]).toBe(TYPING_FINGER_COLOR.right[finger]);
    }
  });

  it("gives the middle fingers purple and keeps every typing finger distinct", () => {
    expect(TYPING_FINGER_COLOR.left[3]).toBe(FINGER_COLOR[1]);
    const colors = [
      TYPING_FINGER_COLOR.left[2],
      TYPING_FINGER_COLOR.left[3],
      TYPING_FINGER_COLOR.left[4],
      TYPING_FINGER_COLOR.left[5],
      TYPING_FINGER_COLOR.right[2]
    ];
    expect(new Set(colors).size).toBe(5);
  });
});
