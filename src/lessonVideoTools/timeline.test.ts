import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

describe("speech evidence timeline", () => {
  it("keeps absolute times and conflicting hand mentions as unreviewed candidates", () => {
    const evidence = "Сначала правой рукой, потом левой рукой, затем соединяем руки";
    const result = buildTimeline({ segments: [{ start: 65, end: 70, text: evidence }] }, 60, 120);
    expect(result.reviewed).toBe(false);
    expect(result.candidates).toEqual(
      ["right", "left", "both"].map((stage) => ({ stage, at: 65, end: 70, evidence }))
    );
  });
  it("does not invent an exercise from music or speech without hand mentions", () => {
    expect(buildTimeline({ segments: [] }, 60, 120).candidates).toEqual([]);
    expect(
      buildTimeline({ segments: [{ start: 65, end: 70, text: "Играем медленно" }] }, 60, 120)
        .candidates
    ).toEqual([]);
  });
  it.each([
    null,
    {},
    { segments: [{ start: 5, end: 10, text: "Правая рука" }] },
    { segments: [{ start: 65, end: 130, text: "Правая рука" }] },
    { segments: [{ start: 65, end: NaN, text: "Правая рука" }] }
  ])("rejects malformed or fragment-relative timestamps", (transcript) => {
    expect(() => buildTimeline(transcript, 60, 120)).toThrow();
  });
});
