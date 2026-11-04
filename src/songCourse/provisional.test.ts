import { describe, expect, it } from "vitest";
import { SongCourseAttempt } from "./attempt";
import type { RawCourseInput, SongCourseAttemptConfig } from "./model";
const config: SongCourseAttemptConfig = {
  learnerPartIds: ["learner"],
  runId: "run",
  songId: "song",
  sourceRevision: "1",
  sourceHash: "a".repeat(64),
  nodeId: "node",
  mode: "wait",
  speed: 1,
  expected: [
    {
      sourceNoteId: "song@1:c",
      runtimeNoteId: "c",
      pitch: 60,
      start: 0,
      startBeat: 0,
      duration: 1,
      phraseId: "p",
      measureIndex: 0
    }
  ]
};
const event = (
  type: "down" | "up",
  at: number,
  ordinal: number,
  extra: Partial<RawCourseInput> = {}
): RawCourseInput => ({
  type,
  source: "midi",
  pitch: 60,
  performanceMs: at,
  rawPerformanceMs: at,
  songTime: at / 1000,
  stableOrdinal: ordinal,
  ...extra
});
function waitAttempt() {
  const attempt = new SongCourseAttempt(config);
  attempt.present("song@1:c", 0, 0);
  return attempt;
}

describe("provisional note expressions share the final rubric", () => {
  it("stays neutral while physically held, then celebrates only the correctly released duration", () => {
    const attempt = waitAttempt();
    expect(attempt.input(event("down", 0, 1)).feedback).toEqual([
      { sourceNoteId: "song@1:c", state: "neutral" }
    ]);
    expect(attempt.input(event("down", 500, 2)).feedback).toEqual([]);
    expect(attempt.input(event("up", 1000, 3)).feedback).toEqual([
      { sourceNoteId: "song@1:c", state: "correct" }
    ]);
    attempt.finish(1000);
    expect(attempt.tick(2000, 1)?.notes[0]?.mistakes).toEqual([]);
  });
  it("marks a wrong pitch gently and still accepts the same expected source note afterwards", () => {
    const attempt = waitAttempt();
    const wrong = attempt.input(event("down", 10, 1, { pitch: 62 }));
    expect(wrong.matchedSourceNoteId).toBeUndefined();
    expect(wrong.feedback).toEqual([
      { sourceNoteId: "song@1:c", state: "gentle-wrong", reason: "pitch" }
    ]);
    expect(attempt.input(event("down", 20, 2)).matchedSourceNoteId).toBe("song@1:c");
  });
  it("keeps a +200ms correct pitch but displays the same onset failure as the final result", () => {
    const attempt = new SongCourseAttempt({ ...config, mode: "tempo" });
    const down = attempt.input(event("down", 200, 1));
    expect(down.matchedSourceNoteId).toBe("song@1:c");
    expect(down.feedback?.[0]).toMatchObject({ state: "gentle-wrong", reason: "onset" });
    expect(attempt.input(event("up", 1200, 2)).feedback?.[0]).toMatchObject({
      state: "gentle-wrong",
      reason: "onset"
    });
    attempt.finish(1200);
    expect(attempt.tick(2200, 1)?.notes[0]?.mistakes).toEqual(["onset"]);
  });
  it("does not confuse a short physical hold with a correct answer", () => {
    const attempt = waitAttempt();
    attempt.input(event("down", 0, 1));
    expect(attempt.input(event("up", 100, 2)).feedback?.[0]).toMatchObject({
      state: "gentle-wrong",
      reason: "hold"
    });
  });
  it("ignores synthetic, foreign and control-rehold attacks", () => {
    const attempt = waitAttempt();
    expect(attempt.input(event("down", 0, 1, { synthetic: true })).feedback).toBeUndefined();
    expect(attempt.input(event("down", 0, 2, { admitted: false })).feedback).toEqual([]);
    attempt.input(event("up", 10, 3));
    attempt.input(event("down", 20, 4));
    attempt.pause(520, 5);
    attempt.requestResume();
    expect(attempt.input(event("up", 600, 6)).feedback).toBeUndefined();
    const rehold = attempt.input(event("down", 700, 7));
    expect(rehold.controlRehold).toBe(true);
    expect(rehold.feedback).toBeUndefined();
    expect(attempt.input(event("up", 1200, 8)).feedback?.[0]).toMatchObject({ state: "correct" });
  });
});

it("does not celebrate a calibrated physical up beyond the bounded final collection deadline", () => {
  const attempt = new SongCourseAttempt({ ...config, mode: "tempo" });
  attempt.input(event("down", 0, 1, { rawPerformanceMs: 100 }));
  attempt.finish(1000);
  const release = attempt.input(event("up", 1150, 2, { rawPerformanceMs: 1250, songTime: 1.15 }));
  expect(release.feedback).toEqual([]);
  expect(attempt.tick(1300, 1)).toMatchObject({ hold: 0, stars: 0 });
});
it("celebrates a correctly calibrated physical release using raw duration instead of corrected close time", () => {
  const attempt = new SongCourseAttempt({ ...config, mode: "tempo" });
  attempt.input(event("down", 0, 1, { rawPerformanceMs: 100 }));
  const release = attempt.input(event("up", 1000, 2, { rawPerformanceMs: 1100, songTime: 1 }));
  expect(release.feedback).toEqual([{ sourceNoteId: "song@1:c", state: "correct" }]);
});
