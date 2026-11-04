import { describe, expect, it } from "vitest";
import { beginnerDisplayRange, BEGINNER_STAGES } from "./catalog";
describe("beginner keyboard framing", () => {
  it.each(BEGINNER_STAGES)("shows one octave for $id including its final C", (stage) => {
    const range = beginnerDisplayRange(stage);
    if (!range) throw new Error("missing beginner range");
    const [low, high] = range;
    expect(low).toBe(stage.hand === "right" ? 60 : 48);
    expect(high - low).toBe(12);
    expect(stage.pitches.every((pitch) => pitch >= low && pitch <= high)).toBe(true);
  });
});
