import { describe, expect, it } from "vitest";
import { SongCourseAttempt } from "./attempt";
import { courseConfig, expectedNote, rawInput } from "./testFixtures";

describe("bounded song course release collection", () => {
  it("keeps collecting a late real up after musical finished", () => {
    const run = new SongCourseAttempt(courseConfig());
    run.input(rawInput("down", 0, 0));
    run.finish(1000);
    expect(run.phase).toBe("awaiting-release");
    expect(run.tick(1100, 1700000000000)).toBeNull();
    run.input(rawInput("up", 1150, 1));
    expect(run.tick(1200, 1700000000200)).toMatchObject({ hold: 100, stars: 3 });
    expect(run.tick(5000, 1700000005000)).toBe(run.result);
  });
  it("cannot repair a missing release using synthetic cleanup", () => {
    const run = new SongCourseAttempt(courseConfig());
    run.input(rawInput("down", 0, 0));
    run.finish(1000);
    run.input(rawInput("up", 1000, 1, 60, { synthetic: true }));
    expect(run.tick(1200, 1700000000000)).toMatchObject({ hold: 0, stars: 0 });
  });
  it("never waits more than one second for a very long terminal note", () => {
    const run = new SongCourseAttempt(courseConfig([expectedNote(0, 60, 0, 10)]));
    run.input(rawInput("down", 0, 0));
    run.finish(10000);
    expect(run.deadlineMs).toBe(11000);
    expect(run.tick(11000, 1700000000000)?.hold).toBe(0);
  });
  it("does not turn a post-end down into a missed attack", () => {
    const run = new SongCourseAttempt(courseConfig());
    run.finish(1000);
    run.input(rawInput("down", 1050, 0, 60, { songTime: 0 }));
    run.input(rawInput("up", 1150, 1));
    expect(run.tick(1200, 1700000000000)).toMatchObject({
      pitch: 0,
      onset: 0,
      hold: 0,
      completed: false
    });
  });
  it("sorts a full delayed callback stream before the immutable deadline receipt", () => {
    const first = new SongCourseAttempt(courseConfig());
    const second = new SongCourseAttempt(courseConfig());
    const down = rawInput("down", 0, 0),
      up = rawInput("up", 1000, 1);
    first.input(down);
    first.finish(1000);
    first.input(up);
    second.finish(1000);
    second.input(up);
    second.input(down);
    expect(first.tick(1200, 1700000000000)).toEqual(second.tick(1200, 1700000000000));
  });
});

describe("pause and explicit rehold control", () => {
  it("requires real all-up and the same held note before resuming", () => {
    const note = expectedNote(0, 60, 0, 2);
    const run = new SongCourseAttempt(courseConfig([note]));
    run.input(rawInput("down", 0, 0));
    run.pause(1000, 1);
    run.input(rawInput("up", 1000, 2, 60, { synthetic: true }));
    expect(run.requestResume()).toBe(false);
    expect(run.phase).toBe("awaiting-keys-up");
    expect(run.input(rawInput("up", 1500, 3)).resumeTransport).toBe(false);
    expect(run.phase).toBe("awaiting-rehold");
    const decision = run.input(rawInput("down", 3000, 4, 60, { songTime: 1 }));
    expect(decision).toEqual({ resumeTransport: true, controlRehold: true });
    run.input(rawInput("up", 4000, 5, 60, { songTime: 2 }));
    run.finish(4000);
    expect(run.tick(4400, 1700000000000)).toMatchObject({ stars: 3, extraCount: 0, hold: 100 });
  });
  it("does not let a wrong rehold consume the next repeated C", () => {
    const run = new SongCourseAttempt(
      courseConfig([expectedNote(0, 60, 0, 2), expectedNote(1, 60, 2, 1)])
    );
    run.input(rawInput("down", 0, 0));
    run.pause(1000, 1);
    run.requestResume();
    run.input(rawInput("up", 1500, 2));
    expect(run.input(rawInput("down", 2000, 3, 62)).resumeTransport).toBe(false);
    run.input(rawInput("up", 2100, 4, 62));
    expect(run.input(rawInput("down", 2500, 5, 60, { songTime: 1 })).controlRehold).toBe(true);
    run.input(rawInput("up", 3500, 6, 60, { songTime: 2 }));
    run.finish(4500);
    const result = run.tick(4700, 1700000000000);
    expect(result?.notes[0]?.matched).toBe(true);
    expect(result?.notes[1]?.matched).toBe(false);
    expect(result?.extraCount).toBe(1);
  });
  it("does not improve a disconnected hold with cleanup or award a canceled run", () => {
    const run = new SongCourseAttempt(courseConfig());
    run.input(rawInput("down", 0, 0));
    run.invalidate("disconnect");
    run.input(rawInput("up", 1000, 1, 60, { synthetic: true }));
    run.finish(1000);
    expect(run.tick(1200, 1700000000000)).toMatchObject({
      valid: false,
      completed: false,
      hold: 0,
      stars: 0
    });
    const canceled = new SongCourseAttempt(courseConfig());
    canceled.input(rawInput("down", 0, 0));
    canceled.abort("seek");
    canceled.finish(1000);
    expect(canceled.tick(5000, 1700000000000)).toBeNull();
  });
  it("keeps physical segments calibrated once when pausing a source with latency correction", () => {
    const run = new SongCourseAttempt(courseConfig([expectedNote(0, 60, 0, 2)]));
    run.input(rawInput("down", 0, 0, 60, { rawPerformanceMs: 100 }));
    run.pause(1100, 1);
    run.requestResume();
    run.input(rawInput("up", 1500, 2, 60, { rawPerformanceMs: 1600 }));
    run.input(rawInput("down", 2900, 3, 60, { rawPerformanceMs: 3000, songTime: 1 }));
    run.input(rawInput("up", 3900, 4, 60, { rawPerformanceMs: 4000, songTime: 2 }));
    run.finish(4000);
    expect(run.tick(4400, 1700000000000)?.notes[0]?.heldMs).toBe(2000);
  });
});

it("keeps a wrong awaiting-rehold attack as extra instead of matching a future note", () => {
  const notes = [expectedNote(0, 60, 0, 2), expectedNote(1, 62, 2, 1)];
  const run = new SongCourseAttempt(courseConfig(notes));
  run.input(rawInput("down", 0, 0));
  run.pause(1900, 1);
  run.requestResume();
  run.input(rawInput("up", 1950, 2, 60, { songTime: 1.9 }));
  const wrong = run.input(rawInput("down", 2000, 3, 62, { songTime: 1.9 }));
  expect(wrong.matchedSourceNoteId).toBeUndefined();
  run.input(rawInput("up", 3000, 4, 62, { songTime: 1.9 }));
  expect(run.input(rawInput("down", 3100, 5, 60, { songTime: 1.9 })).controlRehold).toBe(true);
  run.input(rawInput("up", 3200, 6, 60, { songTime: 2 }));
  run.finish(4200);
  const result = run.tick(4500, 1);
  expect(result).toMatchObject({ extraCount: 1, completed: false, stars: 0 });
  expect(result?.notes[1]?.matched).toBe(false);
});

it("keeps real all-up ownership when callbacks arrive in reverse physical order", () => {
  const run = new SongCourseAttempt(courseConfig([expectedNote(0, 60, 0, 0.5)]));
  run.input(rawInput("up", 500, 1));
  run.input(rawInput("down", 0, 0));
  run.pause(600, 2);
  expect(run.requestResume(700, 3)).toBe(true);
  expect(run.phase).toBe("playing");
});
it("does not tag a delayed pre-pause attack as a pause-protocol mistake", () => {
  const run = new SongCourseAttempt(courseConfig([expectedNote(0, 60, 0, 0.5)]));
  run.input(rawInput("up", 500, 1));
  run.pause(600, 2);
  const delayed = run.input(rawInput("down", 0, 0));
  expect(delayed.matchedSourceNoteId).toBe("test@r1:n0");
  expect(run.rawInputs.find((input) => input.type === "down")?.pauseProtocolAttack).toBeUndefined();
  expect(run.requestResume(700, 3)).toBe(true);
  run.finish(1000);
  expect(run.tick(1200, 1)).toMatchObject({ pitch: 100, hold: 100, extraCount: 0 });
});
it("classifies a delayed wrong pause attack by physical interval even after valid rehold resumes", () => {
  const run = new SongCourseAttempt(
    courseConfig([expectedNote(0, 60, 0, 2), expectedNote(1, 62, 2, 1)])
  );
  run.input(rawInput("down", 0, 0));
  run.pause(1900, 1);
  run.requestResume();
  run.input(rawInput("up", 1950, 2, 60, { songTime: 1.9 }));
  run.input(rawInput("down", 3100, 5, 60, { songTime: 1.9 }));
  run.input(rawInput("up", 3200, 6, 60, { songTime: 2 }));
  run.input(rawInput("up", 3000, 4, 62, { songTime: 1.9 }));
  const wrong = run.input(rawInput("down", 2000, 3, 62, { songTime: 1.9 }));
  expect(wrong.matchedSourceNoteId).toBeUndefined();
  run.finish(4200);
  expect(run.tick(4500, 1)).toMatchObject({ extraCount: 1, completed: false });
});

it("rejects an attack physically after musical end even when calibration backdates its onset", () => {
  const run = new SongCourseAttempt(courseConfig([expectedNote(0, 60, 0.9, 0.1)]));
  run.finish(1000);
  const down = run.input(rawInput("down", 910, 0, 60, { rawPerformanceMs: 1010, songTime: 0.91 }));
  expect(down.matchedSourceNoteId).toBeUndefined();
  run.input(rawInput("up", 1010, 1, 60, { rawPerformanceMs: 1110, songTime: 1.01 }));
  expect(run.tick(1120, 1)).toMatchObject({ pitch: 0, hold: 0, stars: 0 });
});
it("excludes paused time for an already long-enough hold without asking for control rehold", () => {
  const run = new SongCourseAttempt(
    courseConfig([expectedNote(0, 60, 0, 1), expectedNote(1, 62, 2, 1)])
  );
  run.input(rawInput("down", 0, 0));
  run.pause(1100, 1);
  expect(run.requestResume(1200, 2)).toBe(false);
  expect(run.input(rawInput("up", 5000, 3)).resumeTransport).toBe(true);
  expect(run.phase).toBe("playing");
  run.input(rawInput("down", 5900, 4, 62, { songTime: 2 }));
  run.input(rawInput("up", 6900, 5, 62, { songTime: 3 }));
  run.finish(6900);
  const result = run.tick(7100, 1);
  expect(result).toMatchObject({ pitch: 100, onset: 100, hold: 100, stars: 3 });
  expect(result?.notes.map((note) => note.heldMs)).toEqual([1100, 1000]);
});
