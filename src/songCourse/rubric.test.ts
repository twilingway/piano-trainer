import { describe, expect, it } from "vitest";
import { gradeSongCourseAttempt, starsForCourseAxes } from "./rubric";
import { alignCourseInputs } from "./alignment";
import { courseConfig, expectedNote, gradeEvidence, rawInput } from "./testFixtures";

describe("song course independent pitch, onset and hold", () => {
  it("keeps a correct pitch at +200ms separate from a bad onset", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 200, 0), rawInput("up", 1200, 1)])
    );
    expect(result).toMatchObject({ pitch: 100, onset: 0, hold: 100, stars: 2, completed: true });
  });
  it("uses the separate learning review window without inflating normal results", () => {
    const evidence = gradeEvidence([rawInput("down", 200, 0), rawInput("up", 1200, 1)]);
    expect(
      gradeSongCourseAttempt(
        courseConfig(undefined, { rubricVariant: "learning-review" }),
        evidence
      ).onset
    ).toBe(100);
    expect(gradeSongCourseAttempt(courseConfig(), evidence).onset).toBe(0);
  });
  it("requires four genuine presses for four repeated Cs", () => {
    const notes = Array.from({ length: 4 }, (_, index) => expectedNote(index));
    const longHold = [
      rawInput("down", 0, 0),
      rawInput("down", 1000, 1),
      rawInput("down", 2000, 2),
      rawInput("up", 4000, 3)
    ];
    const result = gradeSongCourseAttempt(
      courseConfig(notes),
      gradeEvidence(longHold, { musicalEndPerformanceMs: 4000, closedAtPerformanceMs: 4200 })
    );
    expect(result.pitch).toBe(25);
    expect(result.notes.filter((note) => note.matched)).toHaveLength(1);
    const separate = notes.flatMap((_, index) => [
      rawInput("down", index * 1000, index * 2),
      rawInput("up", (index + 1) * 1000, index * 2 + 1)
    ]);
    expect(
      gradeSongCourseAttempt(
        courseConfig(notes),
        gradeEvidence(separate, { musicalEndPerformanceMs: 4000, closedAtPerformanceMs: 4200 })
      ).stars
    ).toBe(3);
  });
  it("breaks equal association distances by the earlier score event", () => {
    const notes = [expectedNote(0, 60, 0, 0.1), expectedNote(1, 60, 0.8, 0.1)];
    const alignment = alignCourseInputs(notes, [rawInput("down", 400, 0)], "tempo", 1);
    expect([...alignment.primary.keys()]).toEqual([notes[0]?.sourceNoteId]);
  });
  it("retains a wrong extra attack after the player corrects it", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([
        rawInput("down", 0, 0, 62),
        rawInput("up", 10, 1, 62),
        rawInput("down", 20, 2),
        rawInput("up", 1020, 3)
      ])
    );
    expect(result).toMatchObject({ pitch: 50, onset: 100, hold: 100, extraCount: 1 });
    expect(result.mistakePhraseIds).toEqual(["phrase0"]);
  });
  it("does not depend on delivery order when timestamps and ordinals survive", () => {
    const inputs = [rawInput("down", 0, 0), rawInput("up", 1000, 1)];
    expect(gradeSongCourseAttempt(courseConfig(), gradeEvidence([...inputs].reverse()))).toEqual(
      gradeSongCourseAttempt(courseConfig(), gradeEvidence(inputs))
    );
  });
  it("only admits the currently presented wait target, never a future C", () => {
    const notes = [expectedNote(), expectedNote(1)];
    const inputs = [
      rawInput("down", 5000, 2),
      rawInput("up", 6000, 3),
      rawInput("down", 6200, 4),
      rawInput("up", 7200, 5)
    ];
    const result = gradeSongCourseAttempt(
      courseConfig(notes, { mode: "wait" }),
      gradeEvidence(inputs, {
        musicalEndPerformanceMs: 8000,
        closedAtPerformanceMs: 8300,
        presentations: [{ sourceNoteId: "test@r1:n0", performanceMs: 4000, stableOrdinal: 1 }]
      })
    );
    expect(result).toMatchObject({ onset: null, pitch: 100 / 3, extraCount: 1 });
    expect(result.notes[1]?.matched).toBe(false);
  });
  it("uses the chosen speed for both onset and physical duration", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(undefined, { speed: 0.5 }),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 2000, 1, 60, { songTime: 1 })], {
        musicalEndPerformanceMs: 2000,
        closedAtPerformanceMs: 2400
      })
    );
    expect(result).toMatchObject({ stars: 3, speed: 0.5, completed: true });
  });
  it("compares wait presentation with actual physical time rather than onset compensation", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(undefined, { mode: "wait" }),
      gradeEvidence(
        [
          rawInput("down", 250, 1, 60, { rawPerformanceMs: 550, songTime: 0 }),
          rawInput("up", 1250, 2, 60, { rawPerformanceMs: 1550, songTime: 1 })
        ],
        {
          presentations: [{ sourceNoteId: "test@r1:n0", performanceMs: 500, stableOrdinal: 0 }],
          musicalEndPerformanceMs: 1600,
          closedAtPerformanceMs: 1900
        }
      )
    );
    expect(result).toMatchObject({ pitch: 100, onset: null, hold: 100, stars: 3 });
  });
  it("keeps an unadmitted source out of the score and out of another source's release", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([
        rawInput("down", 0, 0),
        rawInput("down", 20, 1, 60, { source: "pc", admitted: false }),
        rawInput("up", 50, 2, 60, { source: "pc", admitted: false }),
        rawInput("up", 1000, 3)
      ])
    );
    expect(result.stars).toBe(3);
    expect(result.extraCount).toBe(0);
  });
  it("cannot award three stars through pitch alone", () => {
    expect(starsForCourseAxes(100, 100, 0)).toBe(1);
    expect(starsForCourseAxes(100, 0, 100)).toBe(2);
    expect(starsForCourseAxes(95, null, 90)).toBe(3);
  });
});

it("rejects a physical release beyond the collection deadline despite a corrected stamp inside it", () => {
  const result = gradeSongCourseAttempt(
    courseConfig(),
    gradeEvidence([
      rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }),
      rawInput("up", 1150, 1, 60, { rawPerformanceMs: 1250, songTime: 1.15 })
    ])
  );
  expect(result).toMatchObject({ pitch: 100, onset: 100, hold: 0, stars: 1, completed: true });
  expect(result.notes[0]).toMatchObject({ heldMs: 1100, holdCorrect: false });
});
it("still accepts a physical release exactly on the inclusive collection deadline", () => {
  const result = gradeSongCourseAttempt(
    courseConfig(),
    gradeEvidence([
      rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }),
      rawInput("up", 1100, 1, 60, { rawPerformanceMs: 1200, songTime: 1.1 })
    ])
  );
  expect(result).toMatchObject({ hold: 100, stars: 3 });
});

describe("achievement star boundaries", () => {
  it.each([
    [100, 50, 100, 2],
    [100, 0, 100, 2],
    [100, 100, 0, 1],
    [59.99, 100, 100, 0],
    [60, 0, 0, 1],
    [79.99, 100, 100, 1],
    [80, 0, 79.99, 1],
    [80, 0, 80, 2],
    [94.99, 100, 100, 2],
    [95, 89.99, 90, 2],
    [95, 90, 89.99, 2],
    [95, 90, 90, 3],
    [95, null, 90, 3],
    [80, null, 80, 2],
    [60, null, 0, 1]
  ] as const)("grades pitch %s, onset %s, hold %s as %s", (pitch, onset, hold, stars) => {
    expect(starsForCourseAxes(pitch, onset, hold)).toBe(stars);
  });
  it("credits pitch and hold with two stars while retaining actual onset errors", () => {
    const result = gradeSongCourseAttempt(
      courseConfig([expectedNote(0), expectedNote(1)]),
      gradeEvidence(
        [
          rawInput("down", 0, 0),
          rawInput("up", 1000, 1),
          rawInput("down", 1200, 2),
          rawInput("up", 2200, 3)
        ],
        { musicalEndPerformanceMs: 2000, closedAtPerformanceMs: 2300 }
      )
    );
    expect(result).toMatchObject({
      rubricVersion: "song-course-v2",
      pitch: 100,
      onset: 50,
      hold: 100,
      stars: 2,
      completed: true
    });
    expect(result.notes[1]?.mistakes).toContain("onset");
  });
  it("gives no credit to invalid evidence even with perfect axes", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)], {
        invalidReasons: ["interrupted"]
      })
    );
    expect(result).toMatchObject({
      pitch: 100,
      hold: 100,
      stars: 0,
      completed: false,
      valid: false
    });
  });
});
