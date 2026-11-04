import { describe, expect, it } from "vitest";
import { completedPathSteps, type PathHistories } from "./evidence";
import type { ReadingResult } from "../reading/types";
const empty = (): PathHistories => ({
  right: [],
  left: [],
  intervals: [],
  rhythm: [],
  twoHand: [],
  heldBass: [],
  independent: [],
  music: []
});
const reading = (task: ReadingResult["task"], length = 20, adaptive = false) =>
  ({
    task,
    notes: Array.from({ length }, () => ({})),
    plan: adaptive ? { purpose: "adaptive" } : null
  }) as unknown as ReadingResult;
describe("path completion evidence", () => {
  it("does not count an unfinished series, another task, or adaptive practice as ordinary notes", () => {
    expect(completedPathSteps({ ...empty(), right: [reading("notes", 19)] })).toEqual([]);
    expect(completedPathSteps({ ...empty(), right: [reading("notes", 20, true)] })).toEqual([]);
    expect(completedPathSteps({ ...empty(), right: [reading("phrases")] })).toEqual([
      "right-phrases"
    ]);
  });
  it("keeps left and right tasks separate and does not infer either introduction", () => {
    const h = { ...empty(), right: [reading("notes")] };
    expect(completedPathSteps(h)).toEqual(["right-notes"]);
  });
  it("distinguishes visual and auditory intervals and ignores an unfinished question set", () => {
    const r = (mode: string, n: number) => ({ mode, completedAt: 2, questions: Array(n).fill({}) });
    const h = {
      ...empty(),
      intervals: [r("see-and-play", 10), r("hear-and-choose", 9)]
    } as unknown as PathHistories;
    expect(completedPathSteps(h)).toEqual(["interval-see"]);
  });
  it("does not finish an integrated course from a partial mini-lesson", () => {
    const h = {
      ...empty(),
      music: [{ course: "integrated", completedAt: 2, state: { completedPhases: [1, 2] } }]
    } as unknown as PathHistories;
    expect(completedPathSteps(h)).toEqual([]);
  });
});
