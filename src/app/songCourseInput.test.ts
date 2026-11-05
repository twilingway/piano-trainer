import { PracticeSession as RealPracticeSession } from "../practice/session";
import { describe, expect, it, vi } from "vitest";
import { SongCourseAttempt } from "../songCourse/attempt";
import type { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import type { CourseMaterial } from "../songCourse/model";
import { courseConfig, expectedNote } from "../songCourse/testFixtures";
import { courseLearnerMode } from "../songCourse/listenRepeat";
import { SongCourseInput } from "./songCourseInput";

function harness() {
  const expected = [
    {
      sourceNoteId: "fixture@1:c",
      runtimeNoteId: "c",
      pitch: 60,
      start: 1,
      duration: 0.5,
      startBeat: 2,
      phraseId: "p",
      measureIndex: 0
    }
  ];
  const attempt = new SongCourseAttempt({
    learnerPartIds: ["learner"],
    runId: "r",
    songId: "fixture",
    sourceRevision: "1",
    sourceHash: "a".repeat(64),
    nodeId: "fixture/performance",
    mode: "tempo",
    speed: 1,
    expected
  });
  const press = vi.fn(() => []),
    release = vi.fn(() => []),
    resume = vi.fn();
  const session = {
    waiting: false,
    time: 1.2,
    songTimeAt: vi.fn(() => 1.2),
    pressKeyAt: press,
    releaseKeyAt: release
  } as unknown as PracticeSession;
  const trainer = { setPlaying: resume } as unknown as Trainer;
  const adapter = new SongCourseInput(
    () => ({
      attempt,
      material: { runtimeToSource: new Map([["c", "fixture@1:c"]]) } as unknown as CourseMaterial,
      trainer,
      demo: false
    }),
    vi.fn(),
    vi.fn()
  );
  return { attempt, session, adapter, press, release, resume };
}
describe("song-course physical input adapter", () => {
  it("keeps a late pitch and the once-corrected timestamp for independent grading", () => {
    const h = harness();
    h.adapter.key(
      { type: "down", pitch: 60, velocity: 90, source: "midi", deviceId: "piano", timestamp: 1250 },
      h.session,
      true,
      { raw: 1250, corrected: 1200, received: 1300, admitted: true }
    );
    expect(h.attempt.rawInputs[0]).toMatchObject({
      performanceMs: 1200,
      rawPerformanceMs: 1250,
      songTime: 1.2,
      pitch: 60
    });
    expect(h.press).toHaveBeenCalledWith(60, 1200, 1300, "piano:0");
    h.adapter.key(
      { type: "up", pitch: 60, velocity: 0, source: "midi", deviceId: "piano" },
      h.session,
      true,
      { raw: 1750, corrected: 1700, received: 1800, admitted: true }
    );
    h.attempt.finish(1800);
    const result = h.attempt.tick(3000, 1);
    expect(result?.notes[0]).toMatchObject({
      matched: true,
      onsetCorrect: false
    });
    expect(result?.notes[0]?.onsetOffsetMs).toBeCloseTo(200);
  });
  it("reholds the same paused note without a second attack or next-note advance", () => {
    const h = harness();
    const event = {
      type: "down" as const,
      pitch: 60,
      velocity: 90,
      source: "midi" as const,
      deviceId: "piano"
    };
    h.adapter.key(event, h.session, true, {
      raw: 1200,
      corrected: 1200,
      received: 1200,
      admitted: true
    });
    h.attempt.pause(1300, h.adapter.nextOrdinal());
    expect(h.attempt.requestResume()).toBe(false);
    h.adapter.key({ ...event, type: "up" }, h.session, false, {
      raw: 1400,
      corrected: 1400,
      received: 1400,
      admitted: false
    });
    h.adapter.key(event, h.session, false, {
      raw: 1500,
      corrected: 1500,
      received: 1500,
      admitted: true
    });
    expect(h.resume).toHaveBeenCalledExactlyOnceWith(true);
    expect(h.press).toHaveBeenCalledOnce();
    expect(
      h.attempt.rawInputs.filter((input) => input.type === "down" && !input.controlRehold)
    ).toHaveLength(1);
  });
});

it("keeps a wrong waiting pitch on the same source note and delivers gentle feedback", () => {
  const expected = [
    {
      sourceNoteId: "fixture@1:c",
      runtimeNoteId: "c",
      pitch: 60,
      start: 0,
      duration: 1,
      startBeat: 0,
      phraseId: "p",
      measureIndex: 0
    }
  ];
  const attempt = new SongCourseAttempt({
    learnerPartIds: ["learner"],
    runId: "r",
    songId: "fixture",
    sourceRevision: "1",
    sourceHash: "a".repeat(64),
    nodeId: "fixture/notes",
    mode: "wait",
    speed: 1,
    expected
  });
  const session = new RealPracticeSession(
    {
      title: "fixture",
      source: "musicxml",
      duration: 1,
      notes: [{ id: "c", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }],
      measures: [],
      beats: []
    },
    { mode: "wait", hands: new Set(["right"]), speed: 1, countInBeats: 0 }
  );
  session.startClock(0);
  session.tick(0);
  const feedback = vi.fn();
  const adapter = new SongCourseInput(
    () => ({
      attempt,
      material: { runtimeToSource: new Map([["c", "fixture@1:c"]]) } as unknown as CourseMaterial,
      trainer: null,
      demo: false
    }),
    vi.fn(),
    vi.fn(),
    feedback
  );
  adapter.key({ type: "down", pitch: 62, velocity: 90, source: "keyboard" }, session, true, {
    raw: 0,
    corrected: 0,
    received: 0,
    admitted: true
  });
  expect(session.owedNote()?.id).toBe("c");
  expect(feedback).toHaveBeenCalledWith(
    [{ sourceNoteId: "fixture@1:c", state: "gentle-wrong", reason: "pitch" }],
    expect.any(Number)
  );
});

function repeatedWaitingCs() {
  const expected = [0, 1].map((index) => ({
    sourceNoteId: `fixture@1:c${String(index)}`,
    runtimeNoteId: `c${String(index)}`,
    pitch: 60,
    start: index,
    duration: 1,
    startBeat: index,
    phraseId: "p",
    measureIndex: 0
  }));
  const attempt = new SongCourseAttempt({
    learnerPartIds: ["learner"],
    runId: "repeat",
    songId: "fixture",
    sourceRevision: "1",
    sourceHash: "a".repeat(64),
    nodeId: "fixture/notes",
    mode: "wait",
    speed: 1,
    expected
  });
  const session = new RealPracticeSession(
    {
      title: "repeated",
      source: "musicxml",
      duration: 2,
      notes: expected.map((note) => ({
        id: note.runtimeNoteId,
        pitch: note.pitch,
        hand: "right",
        start: note.start,
        startBeat: note.startBeat,
        duration: note.duration
      })),
      measures: [],
      beats: []
    },
    { mode: "wait", hands: new Set(["right"]), speed: 1, countInBeats: 0 }
  );
  session.startClock(0);
  session.tick(0);
  const adapter = new SongCourseInput(
    () => ({
      attempt,
      material: {
        runtimeToSource: new Map(expected.map((note) => [note.runtimeNoteId, note.sourceNoteId]))
      } as unknown as CourseMaterial,
      trainer: null,
      demo: false
    }),
    vi.fn(),
    vi.fn()
  );
  adapter.present(session, 0);
  const key = (type: "down" | "up", raw: number, received = raw) =>
    adapter.key({ type, pitch: 60, velocity: 90, source: "keyboard" }, session, true, {
      raw,
      corrected: raw,
      received,
      admitted: true
    });
  return { session, attempt, adapter, key };
}
it("does not leave the shell held gate stale after an up callback precedes an older down", () => {
  const h = repeatedWaitingCs();
  h.key("up", 500, 600);
  h.key("down", 0, 700);
  expect(h.session.stats().hits).toBe(1);
  h.session.tick(1700);
  h.adapter.present(h.session, 1700);
  expect(h.session.owedNote()?.id).toBe("c1");
  h.key("down", 1700);
  expect(h.session.stats().hits).toBe(2);
});
it("never advances a repeated waiting C for a stale attack with no core source-note match", () => {
  const h = repeatedWaitingCs();
  h.key("down", 0);
  h.key("up", 500);
  h.session.tick(1000);
  h.adapter.present(h.session, 1000);
  expect(h.session.owedNote()?.id).toBe("c1");
  h.key("down", 200, 1000);
  expect(h.session.owedNote()?.id).toBe("c1");
  expect(h.session.stats().hits).toBe(1);
  expect(h.attempt.rawInputs.at(-1)?.performanceMs).toBe(200);
});

function continuousCs() {
  const expected = [0, 1, 2, 3].map((index) => expectedNote(index, 60, index + 1, 0.7));
  const attempt = new SongCourseAttempt(
    courseConfig(expected, { mode: courseLearnerMode("notes") })
  );
  const session = new RealPracticeSession(
    {
      title: "stream",
      source: "musicxml",
      duration: 5,
      measures: [],
      beats: [],
      notes: expected.map((note) => ({
        id: note.runtimeNoteId,
        pitch: 60,
        hand: "right",
        part: "learner",
        start: note.start,
        startBeat: note.startBeat,
        duration: note.duration
      }))
    },
    {
      mode: attempt.config.mode,
      hands: new Set(["right"]),
      parts: new Set(["learner"]),
      speed: 1,
      countInBeats: 0
    }
  );
  const trainer = { setPlaying: vi.fn() };
  const adapter = new SongCourseInput(
    () => ({
      attempt,
      material: {
        runtimeToSource: new Map(expected.map((note) => [note.runtimeNoteId, note.sourceNoteId]))
      } as unknown as CourseMaterial,
      trainer: trainer as unknown as Trainer,
      demo: false
    }),
    vi.fn(),
    vi.fn()
  );
  session.startClock(0);
  const key = (type: "down" | "up", at: number) => {
    session.tick(at);
    adapter.key({ type, pitch: 60, velocity: 90, source: "keyboard" }, session, true, {
      raw: at,
      corrected: at,
      received: at,
      admitted: true
    });
    expect(session.waiting).toBe(false);
    expect(session.time).toBeCloseTo(at / 1000);
    expect(attempt.phase).toBe("playing");
  };
  return { expected, attempt, session, trainer, key };
}
it("streams repeated Cs without note gates and retains early, timely, late and hold evidence", () => {
  const h = continuousCs();
  for (const [down, up] of [
    [1000, 1700],
    [1800, 2100],
    [3200, 3700],
    [4000, 4700]
  ]) {
    if (down === undefined || up === undefined) throw new Error("missing interval");
    h.key("down", down);
    h.key("up", up);
  }
  h.session.tick(5500);
  expect(h.session.finished).toBe(true);
  h.attempt.finish(5500);
  const result = h.attempt.tick(6500, 1);
  expect(result?.mode).toBe("tempo");
  expect(result?.pitch).toBe(100);
  expect(result?.notes.map((note) => note.sourceNoteId)).toEqual(
    h.expected.map((note) => note.sourceNoteId)
  );
  for (const [index, offset] of [0, -200, 200, 0].entries())
    expect(result?.notes[index]?.onsetOffsetMs).toBeCloseTo(offset);
  for (const [index, heldMs] of [700, 300, 500, 700].entries())
    expect(result?.notes[index]?.heldMs).toBeCloseTo(heldMs);
  expect(
    h.attempt.rawInputs
      .filter((input) => input.type === "down")
      .map((input) => input.rawPerformanceMs)
  ).toEqual([1000, 1800, 3200, 4000]);
  expect(h.trainer.setPlaying).not.toHaveBeenCalled();
});
it("keeps the clock running past a following C while the previous physical C stays held", () => {
  const h = continuousCs();
  h.key("down", 1000);
  h.session.tick(2100);
  expect(h.session.time).toBeCloseTo(2.1);
  expect(h.session.waiting).toBe(false);
  expect(h.attempt.phase).toBe("playing");
  h.key("down", 2200);
  h.key("up", 2300);
  h.key("down", 3000);
  h.key("up", 3700);
  h.attempt.finish(5500);
  const result = h.attempt.tick(6500, 1);
  expect(result?.notes.map((note) => note.matched)).toEqual([true, false, true, false]);
  expect(result?.notes[0]?.heldMs).toBeCloseTo(1300);
  expect(h.trainer.setPlaying).not.toHaveBeenCalled();
});
