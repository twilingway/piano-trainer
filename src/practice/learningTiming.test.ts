import { describe, expect, it } from "vitest";
import type { Song, SongNote } from "../song/song";
import { GameScore } from "./gameScore";
import { judgeOffset } from "./gameRules";
import { PracticeSession } from "./session";

const note = (id: string, start: number, pitch = 60): SongNote => ({
  id,
  start,
  pitch,
  startBeat: start,
  duration: 0.05,
  hand: "right"
});
const song = (notes: SongNote[]): Song => ({
  title: "learning",
  source: "midi",
  notes,
  measures: [],
  beats: [],
  duration: 0.1
});
const run = (learningWindow = true, speed = 1, notes = [note("a", 0)]) => {
  const session = new PracticeSession(song(notes), {
    mode: "tempo",
    hands: new Set(["right"]),
    speed,
    difficulty: "normal",
    learningWindow
  });
  session.startClock(0);
  return session;
};

describe("learning late timing", () => {
  it("keeps earlier note at a fractional midpoint despite floating point drift", () => {
    const session = run(true, 1, [note("a", 0.1), note("b", 0.3)]);
    session.tick(2200);
    expect(session.pressKeyAt(60, 2200)[0]).toMatchObject({ noteId: "a" });
  });

  it("counts wrong keys only inside the asymmetric active window", () => {
    const session = run();
    expect(session.pressKeyAt(62, 1799)).toEqual([]);
    expect(session.pressKeyAt(62, 2250)).toEqual([{ type: "wrong", pitch: 62 }]);
    expect(session.pressKeyAt(62, 2301)).toEqual([]);
    expect(session.stats().game?.wrong).toBe(1);
  });

  it("freezes cues on pause and recomputes them after seek", () => {
    const session = run(true, 0.5, [note("a", 0), note("b", 1)]);
    session.tick(3800);
    expect(session.keyHints().map((item) => item.id)).toEqual(["a"]);
    const pausedTime = session.time;
    session.pauseClock(3800);
    session.tick(4800);
    expect(session.time).toBe(pausedTime);
    expect(session.keyHints().map((item) => item.id)).toEqual(["a"]);
    session.seek(1, 4800);
    expect(session.statusOf("a")).toBe("skipped");
    expect(session.keyHints()).toEqual([]);
  });

  it("does not turn waiting reaction into a graded timing hit", () => {
    const session = new PracticeSession(song([note("a", 0)]), {
      mode: "wait",
      hands: new Set(["right"]),
      speed: 1,
      learningWindow: true
    });
    session.startClock(0);
    session.tick(4000);
    expect(session.pressKeyAt(60, 4000)).toEqual([{ type: "hit", noteId: "a", offset: 0 }]);
    expect(session.stats().game).toBeUndefined();
  });
  it.each(["easy", "normal", "hard", "expert"] as const)(
    "extends only late OK for %s",
    (difficulty) => {
      expect(judgeOffset(300, difficulty, true)).toBe("OK");
      expect(judgeOffset(300.001, difficulty, true)).toBe("MISS");
      expect(judgeOffset(-201, difficulty, true)).toBe("MISS");
      expect(judgeOffset(201, difficulty, false)).toBe("MISS");
      expect(judgeOffset(0, difficulty, true)).toBe("PERFECT");
    }
  );

  it.each([1, 0.5])("accepts 200ms real lateness at speed %s with actual signed error", (speed) => {
    const session = run(true, speed);
    const arrival = 2000 / speed;
    session.tick(arrival + 200);
    const events = session.pressKeyAt(60, arrival + 200);
    expect(events[0]).toMatchObject({ type: "hit", judgement: "OK", assisted: true });
    expect(events[0]?.type === "hit" ? events[0].offset : NaN).toBeCloseTo(0.2);
    expect(session.stats().game).toMatchObject({
      score: 25,
      combo: 1,
      accuracy: 25,
      grades: { OK: 1, MISS: 0 }
    });
    expect(session.stats().game?.timing.meanMs).toBe(200);
  });

  it("keeps delivery grace separate and closes after late window plus grace", () => {
    const session = run();
    expect(session.tick(2550).some((event) => event.type === "miss")).toBe(false);
    expect(session.statusOf("a")).toBe("pending");
    const hit = session.pressKeyAt(60, 2300, 2550)[0];
    expect(hit).toMatchObject({ type: "hit", judgement: "OK" });
    expect(hit?.type === "hit" ? hit.offset : NaN).toBeCloseTo(0.3);
    const missed = run();
    expect(missed.tick(2551)).toEqual(
      expect.arrayContaining([{ type: "miss", noteId: "a" }, { type: "finished" }])
    );
    expect(missed.tick(2600)).toEqual([]);
  });

  it("rejects +300.001ms and keeps the early limit strict", () => {
    expect(run().pressKeyAt(60, 2300.001)[0]?.type).not.toBe("hit");
    expect(run().pressKeyAt(60, 1799)[0]?.type).not.toBe("hit");
    expect(run(false).pressKeyAt(60, 2200)[0]?.type).not.toBe("hit");
  });

  it("selects closer next repeated pitch and exposes its cue while old attack awaits", () => {
    const session = run(true, 1, [note("a", 0), note("b", 0.25)]);
    session.tick(2200);
    expect(session.keyHints().map((item) => item.id)).toEqual(["a", "b"]);
    expect(session.pressKeyAt(60, 2240)[0]).toMatchObject({ noteId: "b", judgement: "PERFECT" });
    expect(session.statusOf("a")).toBe("pending");
    expect(session.pressKeyAt(60, 2290)[0]).toMatchObject({ noteId: "a", judgement: "OK" });
  });

  it("finalizes partial chords only after the educational window", () => {
    const session = run(true, 1, [note("a", 0), note("b", 0, 64)]);
    session.tick(2200);
    session.pressKeyAt(60, 2200);
    expect(session.stats().game?.partialChords).toBe(0);
    session.tick(2551);
    expect(session.stats().game?.partialChords).toBe(1);
  });

  it("grades assisted hits consistently and prevents duplicate score", () => {
    const score = new GameScore(1, { learningWindow: true });
    expect(score.hit("a", 200, 0.2)).toBe("OK");
    score.hit("a", 0, 0.3);
    expect(score.snapshot(0.3)).toMatchObject({ score: 25, combo: 1, accuracy: 25, flow: false });
  });
});
