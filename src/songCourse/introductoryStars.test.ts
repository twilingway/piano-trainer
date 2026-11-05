import { describe, expect, it } from "vitest";
import { gradeSongCourseAttempt, starsForCourseAxes } from "./rubric";
import {
  ACHIEVEMENT_SONG_COURSE_RUBRIC_VERSION,
  LEGACY_SONG_COURSE_RUBRIC_VERSION,
  SONG_COURSE_RUBRIC_VERSION
} from "./model";
import {
  completedSongCourseNodes,
  emptySongCourseProgress,
  readSongCourseProgress,
  validSongCourseResult
} from "./progress";
import { songCourseEvidenceMatchesNode } from "./evidenceProof";
import { courseConfig, expectedNote, gradeEvidence, rawInput, sourceFixture } from "./testFixtures";

function fourNoteResult(introductory = true) {
  return gradeSongCourseAttempt(
    courseConfig(
      Array.from({ length: 4 }, (_, index) => expectedNote(index)),
      {
        nodeId: "introduction",
        ...(introductory ? { introductory: true as const } : {})
      }
    ),
    gradeEvidence(
      [
        rawInput("down", 0, 0),
        rawInput("up", 1000, 1),
        rawInput("down", 1000, 2),
        rawInput("up", 2000, 3),
        rawInput("down", 2000, 4),
        rawInput("up", 3000, 5),
        rawInput("down", 3000, 6),
        rawInput("up", 3200, 7)
      ],
      { musicalEndPerformanceMs: 4000, closedAtPerformanceMs: 4200 }
    )
  );
}

function introductionSource() {
  const source = sourceFixture();
  const node = source.nodes[0];
  if (!node) throw new Error("Missing fixture node");
  return {
    ...source,
    nodes: [
      {
        ...node,
        id: "introduction",
        kind: "notes" as const,
        sourceNoteIds: ["n0", "n1", "n2", "n3"]
      }
    ]
  };
}

describe("introductory v3 achievement stars", () => {
  it.each([
    [100, 100, 75, 2],
    [80, 0, 75, 2],
    [100, 100, 74.999, 1],
    [79.999, 100, 75, 1],
    [59.999, 100, 75, 0],
    [60, 0, 0, 1],
    [100, 50, 100, 2],
    [100, 100, 89.999, 2],
    [95, 90, 90, 3],
    [95, null, 90, 3],
    [100, 89.999, 100, 2]
  ] as const)("grades introductory %s/%s/%s as %s", (pitch, onset, hold, stars) => {
    expect(starsForCourseAxes(pitch, onset, hold, SONG_COURSE_RUBRIC_VERSION, true)).toBe(stars);
  });

  it("keeps standard and prior versions at the 80 percent second-star hold threshold", () => {
    expect(starsForCourseAxes(100, 100, 75)).toBe(1);
    expect(starsForCourseAxes(100, 100, 80)).toBe(2);
    expect(starsForCourseAxes(100, 100, 75, ACHIEVEMENT_SONG_COURSE_RUBRIC_VERSION, true)).toBe(1);
    expect(starsForCourseAxes(100, 100, 75, LEGACY_SONG_COURSE_RUBRIC_VERSION, true)).toBe(1);
    expect(starsForCourseAxes(100, 50, 100, LEGACY_SONG_COURSE_RUBRIC_VERSION)).toBe(0);
  });

  it("awards two stars for three genuine held notes without hiding the short fourth note", () => {
    const result = fourNoteResult();
    expect(result).toMatchObject({
      rubricVersion: SONG_COURSE_RUBRIC_VERSION,
      introductory: true,
      pitch: 100,
      onset: 100,
      hold: 75,
      stars: 2,
      completed: true
    });
    expect(result.notes.map((note) => note.holdCorrect)).toEqual([true, true, true, false]);
    expect(result.notes[3]?.mistakes).toEqual(["hold"]);
    expect(validSongCourseResult(result)).toBe(true);
    expect(fourNoteResult(false)).toMatchObject({ hold: 75, stars: 1 });
  });

  it("restores proven v1/v2 without regrading them or accepting forged legacy stars", () => {
    const current = fourNoteResult();
    const { introductory, ...base } = current;
    expect(introductory).toBe(true);
    const v1 = {
      ...base,
      runId: "old-v1",
      rubricVersion: LEGACY_SONG_COURSE_RUBRIC_VERSION,
      stars: 1 as const
    };
    const v2 = {
      ...base,
      runId: "old-v2",
      rubricVersion: ACHIEVEMENT_SONG_COURSE_RUBRIC_VERSION,
      stars: 1 as const
    };
    const saved: unknown = JSON.parse(
      JSON.stringify({ ...emptySongCourseProgress(), results: [v1, v2, current] })
    );
    expect(readSongCourseProgress(saved).results.map((result) => result.stars)).toEqual([1, 1, 2]);
    expect(validSongCourseResult({ ...v1, stars: 2 })).toBe(false);
    expect(validSongCourseResult({ ...v2, stars: 2 })).toBe(false);
    expect(validSongCourseResult({ ...v2, introductory: true, stars: 2 })).toBe(false);
    expect(validSongCourseResult({ ...current, introductory: false })).toBe(false);
    expect(validSongCourseResult({ ...current, stars: 3 })).toBe(false);
    expect(
      validSongCourseResult({ ...current, evidence: { ...current.evidence, inputs: [] } })
    ).toBe(false);
  });

  it("binds introductory credit to the canonical notes node rather than a forged flag", () => {
    const result = fourNoteResult();
    const source = introductionSource();
    const node = source.nodes[0];
    if (!node) throw new Error("Missing fixture node");
    const progress = { ...emptySongCourseProgress(), results: [result] };
    expect(songCourseEvidenceMatchesNode(result, source, node)).toBe(true);
    expect(completedSongCourseNodes(progress, source)).toEqual(["introduction"]);
    for (const kind of [
      "duration",
      "guided-phrase",
      "independent-phrase",
      "performance",
      "review"
    ] as const) {
      const ordinary = { ...node, kind };
      expect(songCourseEvidenceMatchesNode(result, source, ordinary)).toBe(false);
      expect(completedSongCourseNodes(progress, { ...source, nodes: [ordinary] })).toEqual([]);
    }
  });

  it("never credits invalid evidence even when all axes are perfect", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(undefined, { introductory: true }),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)], {
        invalidReasons: ["interrupted"]
      })
    );
    expect(result).toMatchObject({ pitch: 100, onset: 100, hold: 100, stars: 0, valid: false });
  });
});
