import { describe, expect, it } from "vitest";
import type { Song, SongNote } from "../song/song";
import { PracticeSession } from "./session";
import type { PracticeMode } from "./session";

const rightNote: SongNote = {
  id: "r",
  pitch: 60,
  hand: "right",
  start: 0,
  startBeat: 0,
  duration: 1
};
const song: Song = {
  title: "synthetic physical performance",
  source: "musicxml",
  duration: 1,
  notes: [rightNote],
  measures: [],
  beats: []
};
function run(mode: PracticeMode = "tempo", speed = 1, score = song) {
  const session = new PracticeSession(score, { mode, speed, hands: new Set(["right"]) });
  session.startClock(0);
  session.tick(2000 / speed);
  return session;
}

describe("PracticeSession physical result", () => {
  it("recovers a missed note's remaining hold without an attack or WRONG", () => {
    const session = run();
    session.tick(2500);
    expect(session.statusOf("r")).toBe("missed");
    expect(session.pressKeyAt(60, 2500)).toEqual([]);
    session.tick(3300);
    expect(session.stats()).toMatchObject({
      hits: 0,
      misses: 1,
      wrong: 0,
      noteResult: { hitPercent: 0, holdPercent: 35, percent: 35 }
    });
    expect(session.stats().game).toMatchObject({ maxCombo: 0, grades: { MISS: 1 } });
  });
  it("recovers after the attack window before delayed MISS registration", () => {
    const session = run();
    session.tick(2200);
    expect(session.statusOf("r")).toBe("pending");
    expect(session.pressKeyAt(60, 2200)).toEqual([]);
    expect(session.statusOf("r")).toBe("pending");
    session.tick(3300);
    expect(session.stats()).toMatchObject({ hits: 0, misses: 1, wrong: 0 });
    expect(session.stats().noteResult?.percent).toBeCloseTo(56);
  });
  it("does not mark a correct recovered pitch wrong during another attack window", () => {
    const score = {
      ...song,
      notes: [
        ...song.notes,
        { ...rightNote, id: "e", pitch: 64, start: 0.5, startBeat: 0.5, duration: 0.5 }
      ]
    };
    const session = run("tempo", 1, score);
    session.tick(2500);
    expect(session.pressKeyAt(60, 2500)).toEqual([]);
    expect(session.stats().wrong).toBe(0);
    expect(session.pressKeyAt(61, 2500)).toEqual([{ type: "wrong", pitch: 61 }]);
  });
  it("prioritizes an ordinary new attack over an older active note", () => {
    const score = {
      ...song,
      duration: 2,
      notes: [
        { ...rightNote, duration: 2 },
        { ...rightNote, id: "next", start: 1, startBeat: 1 }
      ]
    };
    const session = run("tempo", 1, score);
    session.tick(3000);
    expect(session.pressKeyAt(60, 3000)[0]).toMatchObject({ type: "hit", noteId: "next" });
    session.tick(4300);
    expect(session.stats().noteResult).toMatchObject({
      hitNotes: 1,
      hitPercent: 15,
      holdPercent: 35,
      percent: 50
    });
  });
  it("chooses the latest active onset and never carries holding into a future note", () => {
    const score = {
      ...song,
      duration: 3,
      notes: [
        { ...rightNote, duration: 2 },
        { ...rightNote, id: "later", start: 1, startBeat: 1 },
        { ...rightNote, id: "future", start: 2, startBeat: 2 }
      ]
    };
    const session = run("tempo", 1, score);
    session.tick(3500);
    session.pressKeyAt(60, 3500);
    session.tick(5300);
    expect(session.stats().noteResult?.percent).toBeCloseTo(35 / 3);
    expect(session.stats()).toMatchObject({ hits: 0, misses: 3, wrong: 0 });
  });
  it("uses a stable ID when equal active onsets have different durations", () => {
    const score = {
      ...song,
      duration: 2,
      notes: [
        { ...rightNote, id: "z", duration: 2 },
        { ...rightNote, id: "a" }
      ]
    };
    const session = run("tempo", 1, score);
    session.tick(2500);
    session.pressKeyAt(60, 2500);
    session.tick(4300);
    expect(session.stats().noteResult?.percent).toBe(17.5);
  });
  it("excludes the other hand, skipped notes, a closed range and word typing from recovery", () => {
    const left = {
      ...song,
      duration: 2,
      notes: [
        { ...rightNote, hand: "left" as const },
        { ...rightNote, id: "later", pitch: 64, start: 1, startBeat: 1 }
      ]
    };
    const session = run("tempo", 1, left);
    session.tick(2500);
    session.pressKeyAt(60, 2500);
    expect(session.stats().noteResult?.percent).toBe(0);
    const skipped = run("tempo", 1, {
      ...song,
      duration: 3,
      notes: [{ ...rightNote, duration: 3 }]
    });
    skipped.seek(1, 2000, { leadIn: false });
    skipped.tick(2500);
    skipped.pressKeyAt(60, 2500);
    expect(skipped.stats().noteResult?.percent).toBeNull();
    const clipped = new PracticeSession(song, {
      mode: "tempo",
      speed: 1,
      hands: new Set(["right"]),
      to: 0.5
    });
    clipped.startClock(0);
    clipped.tick(2500);
    clipped.pressKeyAt(60, 2500);
    expect(clipped.stats().noteResult?.percent).toBe(0);
    const word = new PracticeSession(left, {
      mode: "tempo",
      speed: 1,
      hands: new Set(["left"]),
      noteResult: false
    });
    word.startClock(0);
    word.tick(2500);
    expect(word.pressKeyAt(60, 2500)).toEqual([]);
    expect(word.stats().noteResult).toBeUndefined();
  });
  it("recovered holding remains stationary on pause and resumes on song time", () => {
    const session = run();
    session.tick(2500);
    session.pressKeyAt(60, 2500);
    session.pauseClock(2700);
    expect(session.stats().noteResult?.percent).toBeCloseTo(14);
    session.tick(12000);
    expect(session.stats().noteResult?.percent).toBeCloseTo(14);
    session.resumeClock(12000);
    session.tick(12300);
    expect(session.stats().noteResult?.percent).toBeCloseTo(35);
  });
  it("recovered delayed Note Off before Note On has the same final duration", () => {
    const session = run();
    session.tick(2800);
    session.releaseKeyAt(60, 2800);
    session.pressKeyAt(60, 2500, 2800);
    session.tick(3300);
    expect(session.stats().noteResult?.percent).toBeCloseTo(21);
  });
  it.each(["tempo", "wait"] as const)("rates hits and short holds in %s", (mode) => {
    const session = run(mode);
    session.pressKeyAt(60, 2000);
    expect(session.stats().noteResult?.percent).toBe(30);
    session.tick(2500);
    expect(session.stats().noteResult?.percent).toBe(65);
    session.releaseKeyAt(60, 2500);
    session.tick(3300);
    expect(session.stats().noteResult?.percent).toBe(65);
  });
  it.each([0.5, 1, 2])("maximum and proportions do not change at speed %s", (speed) => {
    const session = run("tempo", speed);
    session.pressKeyAt(60, 2000 / speed);
    session.tick(2500 / speed);
    expect(session.stats().noteResult?.percent).toBe(65);
    session.tick(3300 / speed);
    expect(session.stats().noteResult?.percent).toBe(100);
  });
  it("stalled wait time awards no extra hold", () => {
    const score = {
      ...song,
      duration: 2,
      notes: [
        ...song.notes,
        { id: "e", pitch: 64, hand: "right" as const, start: 0.5, startBeat: 0.5, duration: 1.5 }
      ]
    };
    const session = run("wait", 1, score);
    session.pressKeyAt(60, 2000);
    session.tick(2500);
    const before = session.stats().noteResult;
    session.tick(12000);
    expect(session.stats().noteResult).toEqual(before);
    session.pressKeyAt(64, 12000);
    session.tick(12500);
    expect(session.stats().noteResult?.holdPercent).toBeCloseTo((70 * (1 + 1 / 3)) / 2);
  });
  it("physical key held across a pause resumes without a wall-time bonus", () => {
    const session = run();
    session.pressKeyAt(60, 2000);
    session.pauseClock(2200);
    expect(session.stats().noteResult?.percent).toBeCloseTo(44);
    session.tick(9000);
    expect(session.stats().noteResult?.percent).toBeCloseTo(44);
    session.resumeClock(10000);
    session.tick(10800);
    expect(session.stats().noteResult?.percent).toBeCloseTo(100);
  });
  it("release during pause and resumed press retain the actual gap", () => {
    const session = run();
    session.pressKeyAt(60, 2000);
    session.pauseClock(2200);
    session.releaseKeyAt(60, 5000);
    session.resumeClock(10000);
    session.tick(10300);
    session.pressKeyAt(60, 10300);
    session.tick(10800);
    expect(session.stats().noteResult?.percent).toBeCloseTo(79);
    expect(session.stats().noteResult?.hitNotes).toBe(1);
  });
  it("seek resets the result and the assessed denominator to the new segment", () => {
    const score = {
      ...song,
      duration: 2,
      notes: [
        ...song.notes,
        { id: "e", pitch: 64, hand: "right" as const, start: 1, startBeat: 1, duration: 1 }
      ]
    };
    const session = run("tempo", 1, score);
    session.pressKeyAt(60, 2000);
    session.seek(1, 2500);
    expect(session.stats().noteResult).toMatchObject({ expectedNotes: 1, hitNotes: 0, percent: 0 });
  });
  it("ignores automated notes, excluded parts and disabled word scoring", () => {
    const listen = new PracticeSession(song, { mode: "tempo", speed: 1, hands: new Set() });
    listen.advance(5);
    expect(listen.stats().noteResult?.percent).toBeNull();
    const word = new PracticeSession(song, {
      mode: "tempo",
      speed: 1,
      hands: new Set(["right"]),
      noteResult: false
    });
    expect(word.stats().noteResult).toBeUndefined();
    const excluded = new PracticeSession(song, {
      mode: "wait",
      speed: 1,
      hands: new Set(["right"]),
      parts: new Set(["other"])
    });
    expect(excluded.stats().noteResult?.expectedNotes).toBe(0);
  });
  it("clips the held duration to the selected range", () => {
    const session = new PracticeSession(song, {
      mode: "wait",
      speed: 1,
      hands: new Set(["right"]),
      to: 0.5
    });
    session.advance(2);
    session.pressKey(60);
    session.advance(0.5);
    expect(session.stats().noteResult?.percent).toBe(100);
  });
  it("only full attack credit is awarded for any accepted timing judgement", () => {
    const session = run();
    session.pressKeyAt(60, 2100);
    expect(session.stats().noteResult?.hitPercent).toBe(30);
    session.tick(3300);
    expect(session.stats().noteResult?.percent).toBeCloseTo(93);
  });
});
