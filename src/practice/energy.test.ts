import { describe, expect, it } from "vitest";
import type { Song, SongNote } from "../song/song";
import { perfectEnergyPerNote } from "./energy";
import { GameScore } from "./gameScore";
import { LEAD_IN_S, PracticeSession } from "./session";
import { SessionScoring } from "./sessionScoring";

function passage(count: number, duration: number): SongNote[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    pitch: 60,
    start: (index * duration) / count,
    duration: duration / count,
    startBeat: index,
    hand: "right"
  }));
}

describe("passage energy", () => {
  it.each([70, 280])("offers three charges before the ending for %i notes", (count) => {
    const notes = passage(count, 70);
    const score = new SessionScoring(notes, "normal");
    const charges: number[] = [];
    for (const [index, note] of notes.entries()) {
      score.hit(note.id, 0, note.start);
      if (score.activateOverdrive(note.start)) charges.push(index + 1);
    }
    expect(charges).toEqual([(count * 2) / 7, (count * 4) / 7, (count * 6) / 7]);
    expect(score.snapshot(70).energy).toBe(25);
  });

  it.each([
    [20, 75],
    [30, 125],
    [44.9, 125],
    [45, 175],
    [60, 175]
  ])("budgets %i seconds as %i perfect energy", (duration, budget) => {
    const notes = passage(70, duration);
    expect(perfectEnergyPerNote(notes) * notes.length).toBeCloseTo(budget);
  });

  it("keeps fractional gains, halves GREAT, and never charges from other judgements or holds", () => {
    const notes = passage(70, 70);
    const score = new SessionScoring(notes, "normal");
    expect(score.snapshot(100).energy).toBe(0);
    for (const note of notes.slice(0, 40)) score.hit(note.id, 40, note.start);
    expect(score.snapshot(40).energy).toBe(50);
    score.hit("40", 90, 40);
    score.hit("41", 130, 41);
    score.miss("42", 42);
    score.hold("0", 20, 43);
    score.wrong(44);
    score.hit("0", 0, 45);
    expect(score.snapshot(70).energy).toBe(50);
  });

  it("rebuilds the same fixed gain from out-of-order events after activation", () => {
    const notes = passage(70, 70);
    const ordered = new SessionScoring(notes, "normal");
    const reversed = new SessionScoring(notes, "normal");
    for (const score of [ordered, reversed]) {
      for (const note of notes.slice(0, 20)) score.hit(note.id, 0, note.start);
      expect(score.activateOverdrive(19)).toBe(true);
    }
    for (const note of notes.slice(20)) ordered.hit(note.id, 0, note.start);
    for (const note of notes.slice(20).reverse()) reversed.hit(note.id, 0, note.start);
    expect(reversed.snapshot(70)).toEqual(ordered.snapshot(70));
    expect(ordered.snapshot(70).energy).toBe(125);
  });

  it("allows an exact threshold after many fractional gains", () => {
    const score = new GameScore(1000, { perfectEnergy: 50 / 999 });
    for (let index = 0; index < 999; index++) score.hit(String(index), 0, index);
    expect(score.snapshot(999).energy).toBe(50);
    expect(score.activateOverdrive(999)).toBe(true);
    expect(score.snapshot(999).energy).toBe(0);
  });

  it("handles empty and single-note passages", () => {
    expect(perfectEnergyPerNote([])).toBe(0);
    expect(perfectEnergyPerNote(passage(1, 70))).toBe(50);
    expect(new SessionScoring([], "normal").snapshot(70).energy).toBe(0);
  });
});

describe("session energy selection", () => {
  const right = passage(70, 70);
  const song: Song = {
    title: "energy selection",
    source: "midi",
    notes: [
      ...right,
      ...right.map((note) => ({ ...note, id: `l${note.id}`, pitch: 48, hand: "left" as const }))
    ],
    duration: 70,
    beats: [],
    measures: []
  };

  it("normalizes only the selected hand and resets the budget after seeking", () => {
    const run = new PracticeSession(song, { mode: "tempo", hands: new Set(["right"]), speed: 1 });
    run.advance(LEAD_IN_S);
    for (let index = 0; index < 20; index++) {
      run.pressKey(60);
      run.advance(1);
    }
    expect(run.stats().game?.energy).toBe(50);
    run.seek(35);
    expect(run.stats().game?.energy).toBe(0);
    run.advance(LEAD_IN_S);
    for (let index = 0; index < 14; index++) {
      run.pressKey(60);
      run.advance(1);
    }
    // The remaining 35 seconds use 125 energy over 35 right-hand notes.
    expect(run.stats().game?.energy).toBe(50);
  });

  it.each([
    [1, 75],
    [0.5, 125]
  ])("fixes the short passage budget at speed %s", (speed, budget) => {
    const notes = passage(20, 20);
    const run = new PracticeSession(
      { ...song, notes, duration: 20 },
      { mode: "tempo", hands: new Set(["right"]), speed }
    );
    run.advance(LEAD_IN_S / speed);
    for (let index = 0; index < 20; index++) {
      run.pressKey(60);
      run.advance(1 / speed);
    }
    expect(run.stats().game?.energy).toBe(budget);
  });
});
