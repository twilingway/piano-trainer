import { describe, expect, it } from "vitest";
import { gradeSongCourseAttempt } from "./rubric";
import {
  readSongCourseProgress,
  validSongCourseResult,
  completedSongCourseNodes
} from "./progress";
import { courseConfig, expectedNote, gradeEvidence, rawInput, sourceFixture } from "./testFixtures";

describe("immutable replayable song-course evidence", () => {
  it("retains learner roles, canonical events, both timestamps, ordinals and lifecycle markers", () => {
    const inputs = [
      rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }),
      rawInput("up", 1000, 1, 60, { rawPerformanceMs: 1100 })
    ];
    const result = gradeSongCourseAttempt(courseConfig(), gradeEvidence(inputs));
    expect(result.evidence).toMatchObject({
      schemaVersion: 1,
      learnerPartIds: ["learner"],
      expected: [{ sourceNoteId: "test@r1:n0" }],
      inputs,
      presentations: [],
      pauses: [],
      musicalEndPerformanceMs: 1000,
      closedAtPerformanceMs: 1200
    });
    inputs[0] = rawInput("down", 800, 99);
    expect(result.evidence.inputs[0]).toMatchObject({
      performanceMs: 0,
      rawPerformanceMs: 100,
      stableOrdinal: 0
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence.inputs[0])).toBe(true);
    expect(Object.isFrozen(result.notes[0]?.mistakes)).toBe(true);
  });
  it("round-trips the proof and replays it, rejecting missing/future/corrupt evidence", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    );
    const progress = readSongCourseProgress(
      JSON.parse(JSON.stringify({ schemaVersion: 1, selection: null, results: [result] }))
    );
    expect(progress.results).toEqual([result]);
    expect(Object.isFrozen(progress.results[0]?.evidence)).toBe(true);
    expect(validSongCourseResult({ ...result, evidence: undefined })).toBe(false);
    expect(
      validSongCourseResult({ ...result, evidence: { ...result.evidence, schemaVersion: 2 } })
    ).toBe(false);
    expect(
      validSongCourseResult({
        ...result,
        evidence: { ...result.evidence, inputs: [rawInput("down", 0, 0), rawInput("up", 100, 1)] }
      })
    ).toBe(false);
  });
  it("never credits a self-consistent subset, unknown canonical ID, or wrong learner roles for a registered final", () => {
    const base = sourceFixture(),
      node = base.nodes[0];
    if (!node) throw new Error("fixture");
    const source = { ...base, nodes: [{ ...node, sourceNoteIds: ["n0", "n1"] }] };
    const subset = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    );
    expect(validSongCourseResult(subset)).toBe(true);
    expect(
      completedSongCourseNodes({ schemaVersion: 1, selection: null, results: [subset] }, source)
    ).toEqual([]);
    const unknown = gradeSongCourseAttempt(
      courseConfig([{ ...expectedNote(), sourceNoteId: "test@r1:unknown" }]),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    );
    expect(
      completedSongCourseNodes(
        { schemaVersion: 1, selection: null, results: [unknown] },
        sourceFixture()
      )
    ).toEqual([]);
    const wrongRole = gradeSongCourseAttempt(
      courseConfig(undefined, { learnerPartIds: ["backing"] }),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
    );
    expect(
      completedSongCourseNodes(
        { schemaVersion: 1, selection: null, results: [wrongRole] },
        sourceFixture()
      )
    ).toEqual([]);
  });
});
