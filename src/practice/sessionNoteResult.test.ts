import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import { PracticeSession } from "./session";
import type { PracticeMode } from "./session";

const song: Song = {
  title: "synthetic physical performance",
  source: "musicxml",
  duration: 1,
  notes: [{ id: "r", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }],
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
