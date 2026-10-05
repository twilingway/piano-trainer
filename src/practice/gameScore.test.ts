import { describe, expect, it } from "vitest";

import { comboMultiplier, difficultyWindows, holdTicks, judgeOffset } from "./gameRules";
import { idealScore, rankForAccuracy, starsForScore, timingStatistics } from "./gameResults";
import { GameScore } from "./gameScore";

describe("timing grades", () => {
  it.each(["easy", "normal", "hard", "expert"] as const)(
    "includes each %s boundary and excludes its next fraction",
    (difficulty) => {
      const windows = difficultyWindows(difficulty);
      const boundaries = [windows.perfect, windows.great, windows.good, windows.ok];
      const grades = ["PERFECT", "GREAT", "GOOD", "OK", "MISS"];
      for (const [index, boundary] of boundaries.entries()) {
        expect(judgeOffset(boundary, difficulty)).toBe(grades[index]);
        expect(judgeOffset(-boundary, difficulty)).toBe(grades[index]);
        expect(judgeOffset(boundary + 0.001, difficulty)).toBe(grades[index + 1]);
      }
    }
  );

  it("rejects nonfinite attacks and tolerates exact floating hold boundaries", () => {
    expect(judgeOffset(NaN)).toBe("MISS");
    expect(judgeOffset(Infinity)).toBe("MISS");
    expect(holdTicks(0.3)).toBe(3);
    expect(holdTicks(0.299)).toBe(2);
  });
});

describe("score and accuracy", () => {
  it("uses the increased combo multiplier on the tenth and twenty-fifth notes", () => {
    const score = new GameScore(25);
    for (let index = 1; index <= 9; index++) score.hit(String(index), 0, index);
    expect(score.snapshot(9).score).toBe(900);
    score.hit("10", 0, 10);
    expect(score.snapshot(10).score).toBe(1100);
    for (let index = 11; index <= 25; index++) score.hit(String(index), 0, index);
    expect(score.snapshot(25).score).toBe(4200);
    expect([9, 10, 24, 25, 49, 50, 99, 100].map(comboMultiplier)).toEqual([1, 2, 2, 3, 3, 4, 4, 5]);
  });

  it("calculates weighted accuracy independently from holds and wrong presses", () => {
    const score = new GameScore(2);
    score.hit("a", -25, 0);
    score.hold("a", 5, 0.5);
    score.hit("b", 90, 1);
    score.wrong();
    expect(score.snapshot(1)).toMatchObject({ accuracy: 75, rank: "C", holdScore: 50 });
    expect(score.snapshot(1).timing).toMatchObject({ meanMs: 32.5, medianMs: 32.5 });
  });

  it("deduplicates attacks, misses, holds and chord finalization", () => {
    const score = new GameScore(3);
    score.hit("a", 0, 0);
    score.hit("a", 50, 0);
    score.miss("a");
    score.hold("a", 2, 0.2);
    score.hold("a", 2, 0.2);
    score.hold("a", 1, 0.1);
    score.hit("b", 0, 0);
    score.miss("c");
    score.chord("abc", false);
    score.chord("abc", false);
    expect(score.snapshot(1)).toMatchObject({
      score: 220,
      combo: 0,
      maxCombo: 2,
      judgedNotes: 3,
      chords: 1,
      partialChords: 1,
      grades: { PERFECT: 2, GREAT: 0, GOOD: 0, OK: 0, MISS: 1 },
      fullCombo: false,
      holdScore: 20
    });
  });

  it("awards an unmultiplied streak bonus once per streak", () => {
    const score = new GameScore(100);
    for (let index = 0; index < 50; index++) score.hit(String(index), 0, index);
    expect(score.snapshot(50).score).toBe(12300);
    score.hit("49", 0, 50);
    expect(score.snapshot(50).score).toBe(12300);
    score.wrong();
    for (let index = 50; index < 100; index++) score.hit(String(index), 0, index);
    expect(score.snapshot(100).score).toBe(24600);
  });

  it("distinguishes full combo from perfect full combo and handles empty results", () => {
    const good = new GameScore(1);
    good.hit("a", 100, 0);
    expect(good.snapshot(0)).toMatchObject({
      accuracy: 50,
      rank: "F",
      fullCombo: true,
      perfectFullCombo: false
    });
    const perfect = new GameScore(1);
    perfect.hit("a", 0, 0);
    expect(perfect.snapshot(0).perfectFullCombo).toBe(true);
    const empty = new GameScore(0);
    expect(empty.snapshot(0)).toMatchObject({
      accuracy: null,
      rank: null,
      stars: null,
      fullCombo: false,
      timing: { meanMs: null, medianMs: null }
    });
    const missed = new GameScore(1);
    missed.miss("a");
    expect(missed.snapshot(0)).toMatchObject({ accuracy: 0, score: 0, rank: "F" });
  });
});

describe("Flow and Overdrive", () => {
  it("requires twenty high grades and resets Flow without resetting combo on GOOD", () => {
    const score = new GameScore(21);
    for (let index = 0; index < 19; index++) score.hit(String(index), 40, index);
    expect(score.snapshot(19).flow).toBe(false);
    score.hit("19", 40, 19);
    expect(score.snapshot(19).flow).toBe(true);
    score.hit("20", 80, 20);
    expect(score.snapshot(20)).toMatchObject({ flow: false, combo: 21, energy: 42 });
  });

  it("costs fifty energy, lasts ten seconds and adds only its incremental score", () => {
    const score = new GameScore(28);
    expect(score.activateOverdrive(0)).toBe(false);
    for (let index = 0; index < 25; index++) score.hit(String(index), 0, index * 0.1);
    expect(score.activateOverdrive(3)).toBe(true);
    expect(score.snapshot(2.999).overdriveActive).toBe(false);
    expect(score.activateOverdrive(4)).toBe(false);
    expect(score.snapshot(3)).toMatchObject({
      energy: 0,
      multiplier: 6,
      overdriveUntil: 13,
      overdriveLeft: 10
    });
    expect(score.snapshot(2.999).overdriveLeft).toBe(0);
    expect(score.snapshot(6).overdriveLeft).toBe(7);
    score.hit("25", 0, 3);
    score.hold("25", 1, 3.1);
    score.hit("26", 0, 12.999);
    expect(score.snapshot(12.999).overdriveScore).toBe(630);
    score.hit("27", 0, 13);
    expect(score.snapshot(13)).toMatchObject({
      multiplier: 3,
      overdriveActive: false,
      overdriveLeft: 0,
      overdriveScore: 630,
      accuracy: 100
    });
  });
});

describe("result statistics and target", () => {
  it("preserves signed mean, median, early/late and sorted histogram buckets", () => {
    expect(timingStatistics([20, -10, -5, 0, 10, NaN])).toEqual({
      meanMs: 3,
      medianMs: 0,
      early: 2,
      late: 2,
      exact: 1,
      histogram: [
        { fromMs: -10, count: 2 },
        { fromMs: 0, count: 1 },
        { fromMs: 10, count: 1 },
        { fromMs: 20, count: 1 }
      ]
    });
  });

  it("includes every rank and star boundary", () => {
    expect([100, 98, 95, 90, 85, 75, 60, 59.999].map(rankForAccuracy)).toEqual([
      "S+",
      "S",
      "A+",
      "A",
      "B",
      "C",
      "D",
      "F"
    ]);
    expect([0, 299, 300, 500, 700, 850, 1500].map((value) => starsForScore(value, 1000))).toEqual([
      1, 1, 2, 3, 4, 5, 5
    ]);
  });

  it("uses perfect chronological attacks and long holds without Overdrive as target", () => {
    expect(idealScore([])).toBe(0);
    expect(idealScore([{ start: 0, duration: 0.49 }])).toBe(100);
    expect(idealScore([{ start: 0, duration: 0.5 }])).toBe(150);
    const notes = Array.from({ length: 10 }, (_, start) => ({ start, duration: 0.5 }));
    expect(idealScore(notes)).toBe(1650);
    const score = new GameScore(notes.length, { targetScore: idealScore(notes) });
    for (const [index, note] of notes.entries()) {
      score.hit(String(index), 0, note.start);
      for (let tick = 1; tick <= 5; tick++)
        score.hold(String(index), tick, note.start + tick * 0.1);
    }
    expect(score.snapshot(10)).toMatchObject({ score: 1650, targetScore: 1650, stars: 5 });
  });
});
