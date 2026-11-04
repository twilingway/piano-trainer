import { describe, expect, it } from "vitest";
import { gradeSongCourseAttempt } from "./rubric";
import { courseConfig, expectedNote, gradeEvidence, rawInput } from "./testFixtures";

describe("physical primary continuous hold", () => {
  it("rejects a tap instead of a whole note even if the audio or pedal would ring", () => {
    const result = gradeSongCourseAttempt(
      courseConfig([expectedNote(0, 60, 0, 4)]),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 100, 1)], {
        musicalEndPerformanceMs: 4000,
        closedAtPerformanceMs: 4800
      })
    );
    expect(result.hold).toBe(0);
    expect(result.notes[0]?.heldMs).toBe(100);
  });
  it("never sums ordinary retaps to repair a short primary hold", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([
        rawInput("down", 0, 0),
        rawInput("up", 400, 1),
        rawInput("down", 450, 2),
        rawInput("up", 1050, 3)
      ])
    );
    expect(result.notes[0]).toMatchObject({ heldMs: 400, holdCorrect: false });
    expect(result.extraCount).toBe(1);
  });
  it("joins only a named pause and control rehold, excluding paused time", () => {
    const note = expectedNote(0, 60, 0, 2);
    const result = gradeSongCourseAttempt(
      courseConfig([note]),
      gradeEvidence(
        [
          rawInput("down", 0, 0),
          rawInput("up", 1500, 2),
          rawInput("down", 3000, 3, 60, { songTime: 1, controlRehold: note.sourceNoteId }),
          rawInput("up", 4000, 4, 60, { songTime: 2 })
        ],
        {
          pauses: [
            {
              type: "pause",
              performanceMs: 1000,
              stableOrdinal: 1,
              sourceNoteId: note.sourceNoteId
            }
          ],
          musicalEndPerformanceMs: 4000,
          closedAtPerformanceMs: 4400
        }
      )
    );
    expect(result).toMatchObject({ pitch: 100, hold: 100, extraCount: 0, stars: 3 });
    expect(result.notes[0]?.heldMs).toBe(2000);
  });
  it("does not accept synthetic cleanup up as a physical release", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1, 60, { synthetic: true })])
    );
    expect(result.hold).toBe(0);
    expect(result.notes[0]?.heldMs).toBe(1200);
  });
  it("requires the matching source to release a primary hold", () => {
    const result = gradeSongCourseAttempt(
      courseConfig(),
      gradeEvidence([
        rawInput("down", 0, 0),
        rawInput("up", 1000, 1, 60, { source: "other-device" })
      ])
    );
    expect(result.hold).toBe(0);
  });
});

it("orders calibrated releases around physical pause markers before joining rehold segments", () => {
  const note = expectedNote(0, 60, 0, 2);
  const inputs = [
    rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }),
    rawInput("up", 1050, 2, 60, { rawPerformanceMs: 1150, songTime: 1 }),
    rawInput("down", 2900, 3, 60, {
      rawPerformanceMs: 3000,
      songTime: 1,
      controlRehold: note.sourceNoteId
    }),
    rawInput("up", 3900, 4, 60, { rawPerformanceMs: 4000, songTime: 2 })
  ];
  const evidence = gradeEvidence(inputs, {
    pauses: [
      { type: "pause", performanceMs: 1100, stableOrdinal: 1, sourceNoteId: note.sourceNoteId }
    ],
    musicalEndPerformanceMs: 4000,
    closedAtPerformanceMs: 4400
  });
  const result = gradeSongCourseAttempt(courseConfig([note]), evidence);
  expect(result).toMatchObject({ pitch: 100, hold: 100, stars: 3 });
  expect(result.notes[0]?.heldMs).toBe(2000);
  expect(
    gradeSongCourseAttempt(courseConfig([note]), { ...evidence, inputs: [...inputs].reverse() })
  ).toEqual(result);
});
it("uses ordinals to settle physical pause and release at the same millisecond", () => {
  const note = expectedNote(0, 60, 0, 2);
  const result = gradeSongCourseAttempt(
    courseConfig([note]),
    gradeEvidence(
      [
        rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }),
        rawInput("up", 1000, 2, 60, { rawPerformanceMs: 1100, songTime: 1 }),
        rawInput("down", 2900, 3, 60, {
          rawPerformanceMs: 3000,
          songTime: 1,
          controlRehold: note.sourceNoteId
        }),
        rawInput("up", 3900, 4, 60, { rawPerformanceMs: 4000, songTime: 2 })
      ],
      {
        pauses: [
          { type: "pause", performanceMs: 1100, stableOrdinal: 1, sourceNoteId: note.sourceNoteId }
        ],
        musicalEndPerformanceMs: 4000,
        closedAtPerformanceMs: 4400
      }
    )
  );
  expect(result.notes[0]).toMatchObject({ heldMs: 2000, holdCorrect: true });
});
