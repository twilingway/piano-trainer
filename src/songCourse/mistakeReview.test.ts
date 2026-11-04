import { describe, expect, it } from "vitest";
import { songCourseMistakeReview } from "./mistakeReview";
import { gradeSongCourseAttempt } from "./rubric";
import {
  courseConfig,
  expectedNote,
  gradeEvidence,
  rawInput,
  sourceFixture,
  TEST_SOURCE_HASH
} from "./testFixtures";

describe("mistake review from actual score phrases", () => {
  it("selects the real wrong phrase and preserves the original result", () => {
    const note = { ...expectedNote(), measureIndex: 6 };
    const source = {
      ...sourceFixture(),
      phrases: [{ id: "phrase0", fromMeasure: 0, toMeasure: 10, sourceNoteIds: ["n0"] }]
    };
    const result = gradeSongCourseAttempt(
      courseConfig([note]),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 50, 1)])
    );
    const before = JSON.stringify(result);
    const plans = songCourseMistakeReview(source, result);
    expect(plans).toEqual([
      {
        id: "run1:review:phrase0:4",
        sourceRunId: "run1",
        songId: "test",
        sourceRevision: "r1",
        sourceHash: TEST_SOURCE_HASH,
        phraseIds: ["phrase0"],
        sourceNoteIds: ["test@r1:n0"],
        fromMeasure: 4,
        toMeasure: 8
      }
    ]);
    expect(JSON.stringify(result)).toBe(before);
  });
  it("does not manufacture review when there are no mistakes or the score revision changed", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    );
    expect(songCourseMistakeReview(sourceFixture(), result)).toEqual([]);
    expect(
      songCourseMistakeReview(
        { ...sourceFixture(), revision: "r2" },
        { ...result, mistakePhraseIds: ["phrase0"] }
      )
    ).toEqual([]);
  });
  it("splits actual long phrases into review blocks no longer than four measures", () => {
    const source = {
      ...sourceFixture(),
      phrases: [{ id: "phrase0", fromMeasure: 1, toMeasure: 10, sourceNoteIds: ["n0"] }]
    };
    const notes = [1, 5, 9].map((measureIndex, index) => ({
      ...expectedNote(index),
      phraseId: "phrase0",
      measureIndex
    }));
    const result = gradeSongCourseAttempt(
      courseConfig(notes),
      gradeEvidence([], { musicalEndPerformanceMs: 3000, closedAtPerformanceMs: 3200 })
    );
    const plans = songCourseMistakeReview(source, result);
    expect(plans.map((plan) => [plan.fromMeasure, plan.toMeasure])).toEqual([
      [1, 5],
      [5, 9],
      [9, 10]
    ]);
    expect(plans.every((plan) => plan.toMeasure - plan.fromMeasure <= 4)).toBe(true);
    expect(plans.flatMap((plan) => plan.sourceNoteIds)).toEqual(
      notes.map((note) => note.sourceNoteId)
    );
  });
});
