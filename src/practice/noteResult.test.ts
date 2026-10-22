import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { NoteResult, NOTE_RESULT_POLICY, passingNoteResult } from "./noteResult";

const note = (id: string, start = 0, duration = 1, pitch = 60): SongNote => ({
  id,
  start,
  startBeat: start,
  duration,
  pitch,
  hand: "right"
});
const strike = (result: NoteResult, id: string, at = 0, pitch = 60, source = "usb") => {
  result.press(pitch, at, source);
  result.hit(id, at);
};

describe("equal per-note attack and physical hold result", () => {
  it("retains releases delivered before their presses", () => {
    const chronological = new NoteResult([note("a")]);
    const reversed = new NoteResult([note("a")]);
    chronological.press(60, 0, "usb", 0);
    chronological.hit("a", 0);
    chronological.release(60, 0.2, "usb", 200);
    reversed.release(60, 0.2, "usb", 200);
    reversed.press(60, 0, "usb", 0);
    reversed.hit("a", 0);
    expect(reversed.snapshot(1)).toEqual(chronological.snapshot(1));
    expect(reversed.snapshot(1).percent).toBe(44);
  });
  it("an immediate release cannot turn into a held key when delivered first", () => {
    const result = new NoteResult([note("a")]);
    result.release(60, 0, "usb", 0);
    result.press(60, 0, "usb", 0);
    result.hit("a", 0);
    expect(result.snapshot(1).percent).toBe(30);
  });
  it("never borrows a repeated note's hold for an overlapping earlier note", () => {
    const result = new NoteResult([note("a", 0, 2), note("b", 1, 1)]);
    strike(result, "a");
    result.release(60, 0.2, "usb");
    strike(result, "b", 1);
    expect(result.snapshot(2).percent).toBeCloseTo(68.5);
  });
  it("associates represses delivered before their accepted primary attack", () => {
    const result = new NoteResult([note("a")]);
    result.press(60, 0.5, "usb", 500);
    result.release(60, 0.8, "usb", 800);
    result.press(60, 0, "usb", 0);
    result.hit("a", 0);
    result.release(60, 0.2, "usb", 200);
    expect(result.snapshot(1).percent).toBe(65);
  });
  it("reassigns provisional repeats after a delayed new attack is accepted", () => {
    const chronological = new NoteResult([note("a", 0, 2), note("b", 1)]);
    const delayed = new NoteResult([note("a", 0, 2), note("b", 1)]);
    for (const result of [chronological, delayed]) {
      result.press(60, 0, "usb", 0);
      result.hit("a", 0);
      result.release(60, 0.2, "usb", 200);
    }
    chronological.press(60, 1, "usb", 1000);
    chronological.hit("b", 1);
    chronological.release(60, 1.1, "usb", 1100);
    for (const result of [chronological, delayed]) result.press(60, 1.2, "usb", 1200);
    delayed.press(60, 1, "usb", 1000);
    delayed.hit("b", 1);
    delayed.release(60, 1.1, "usb", 1100);
    expect(delayed.snapshot(2)).toEqual(chronological.snapshot(2));
  });
  it("indexes each accepted note independently in long repeated passages", () => {
    const count = 10000;
    const result = new NoteResult(Array.from({ length: count }, (_, i) => note(String(i), i)));
    for (let i = 0; i < count; i++) {
      strike(result, String(i), i);
      result.release(60, i + 0.5, "usb");
    }
    expect(result.snapshot(count).percent).toBe(65);
  });
  it("keeps future, short and missed notes in the fixed denominator", () => {
    const result = new NoteResult([note("a"), note("b", 10, 0.01), note("c", 20), note("d", 30)]);
    strike(result, "a");
    expect(result.snapshot(0).percent).toBe(7.5);
    expect(result.snapshot(1).percent).toBe(25);
    expect(result.snapshot(100).percent).toBe(25);
    expect(result.snapshot(100).expectedNotes).toBe(4);
  });
  it.each([
    [0, 30],
    [0.5, 65],
    [1, 100],
    [2, 100]
  ])("holding %ss produces %s%%", (held, percent) => {
    const result = new NoteResult([note("a")]);
    strike(result, "a");
    result.release(60, held, "usb");
    expect(result.snapshot(3).percent).toBe(percent);
  });
  it("clips early and late holds to the expected interval", () => {
    const early = new NoteResult([note("a", 1)]);
    strike(early, "a", 0.9);
    expect(early.snapshot(1).holdPercent).toBe(0);
    expect(early.snapshot(5).percent).toBe(100);
    const late = new NoteResult([note("a", 1)]);
    strike(late, "a", 1.1);
    expect(late.snapshot(2).percent).toBeCloseTo(93);
  });
  it("rates short durations precisely and zero durations by their accepted attack", () => {
    const short = new NoteResult([note("a", 0, 0.02)]);
    strike(short, "a");
    short.release(60, 0.01, "usb");
    expect(short.snapshot(1).percent).toBe(65);
    const zero = new NoteResult([note("zero", 0, 0)]);
    strike(zero, "zero");
    expect(zero.snapshot(0).percent).toBe(100);
    expect(new NoteResult([]).snapshot(10)).toMatchObject({ expectedNotes: 0, percent: null });
  });
  it("never scores physical spans without an explicit note binding", () => {
    const result = new NoteResult([note("a")]);
    result.press(60, 0, "usb");
    expect(result.snapshot(1).percent).toBe(0);
  });
  it("scores recovered holding independently from the missed attack", () => {
    const result = new NoteResult([note("a")]);
    result.press(60, 0.5, "usb");
    result.recover("a", 0.5);
    expect(result.snapshot(1)).toMatchObject({
      hitNotes: 0,
      hitPercent: 0,
      holdPercent: 35,
      percent: 35
    });
    expect(result.snapshot(10).percent).toBe(35);
  });
  it("recovered holding resumes after gaps and unions independent sources", () => {
    const result = new NoteResult([note("a")]);
    result.press(60, 0.2, "usb");
    result.recover("a", 0.2);
    result.release(60, 0.4, "usb");
    result.press(60, 0.6, "usb");
    result.recover("a", 0.6);
    result.press(60, 0.7, "ble");
    result.recover("a", 0.7);
    result.release(60, 0.8, "usb");
    expect(result.snapshot(1).percent).toBeCloseTo(42);
    expect(result.snapshot(1).hitNotes).toBe(0);
  });
  it("retains recovered Note Off delivered before Note On", () => {
    const result = new NoteResult([note("a")]);
    result.release(60, 0.8, "usb", 800);
    result.press(60, 0.5, "usb", 500);
    result.recover("a", 0.5);
    expect(result.snapshot(1).percent).toBeCloseTo(21);
  });
  it("handles an earlier recovery delivered after its repeat", () => {
    const result = new NoteResult([note("a")]);
    result.press(60, 0.6, "usb", 600);
    result.recover("a", 0.6);
    result.release(60, 0.8, "usb", 800);
    result.press(60, 0.2, "usb", 200);
    result.recover("a", 0.2);
    result.release(60, 0.4, "usb", 400);
    expect(result.snapshot(1).percent).toBeCloseTo(28);
  });
  it("never transfers a recovered physical span into the next repeated pitch", () => {
    const result = new NoteResult([note("a"), note("b", 1)]);
    result.press(60, 0.5, "usb");
    result.recover("a", 0.5);
    expect(result.snapshot(2).percent).toBe(17.5);
    result.press(60, 1.5, "usb");
    result.recover("b", 1.5);
    expect(result.snapshot(2).percent).toBe(35);
  });
  it("keeps an explicit recovered repeated note after a delayed earlier hit", () => {
    const result = new NoteResult([note("a", 0, 2), note("b", 1)]);
    result.press(60, 1.5, "usb", 1500);
    result.recover("b", 1.5);
    result.press(60, 0, "usb", 0);
    result.hit("a", 0);
    result.release(60, 0.2, "usb", 200);
    expect(result.snapshot(2).percent).toBeCloseTo(36);
  });
  it("rejects recovery before start, at end, of zero duration or for a different pitch", () => {
    for (const [at, duration, pitch] of [
      [-0.1, 1, 60],
      [1, 1, 60],
      [0, 0, 60],
      [0.5, 1, 64]
    ]) {
      const result = new NoteResult([note("a", 0, duration)]);
      result.press(pitch ?? 0, at ?? 0, "usb");
      result.recover("a", at ?? 0);
      expect(result.snapshot(2).percent).toBe(0);
    }
  });
  it("adds real resumed intervals without recovering gaps or extra attacks", () => {
    const result = new NoteResult([note("a")]);
    strike(result, "a");
    result.release(60, 0.2, "usb");
    result.press(60, 0.5, "usb");
    result.hit("a", 0.5);
    result.press(60, 0.6, "usb");
    expect(result.snapshot(1)).toMatchObject({
      hitNotes: 1,
      hitPercent: 30,
      holdPercent: 49,
      percent: 79
    });
  });
  it("unions sources while separately evaluating notes in a chord", () => {
    const result = new NoteResult([note("a"), note("b", 0, 1, 64)]);
    strike(result, "a");
    strike(result, "b", 0, 64);
    result.press(60, 0, "ble");
    result.release(60, 0.5, "usb");
    result.release(64, 0.5, "usb");
    expect(result.snapshot(1).percent).toBe(82.5);
    result.release(60, 0.7, "ble");
    expect(result.snapshot(1).percent).toBe(72);
  });
  it("a delayed old release cannot close a newer attack, even at identical song time", () => {
    const result = new NoteResult([note("a"), note("b", 1)]);
    result.press(60, 0, "usb", 0);
    result.hit("a", 0);
    result.press(60, 1, "usb", 2000);
    result.hit("b", 1);
    result.release(60, 0.9, "usb", 900);
    expect(result.snapshot(2).percent).toBeCloseTo(96.5);
    result.press(60, 1, "usb", 3000);
    result.release(60, 1, "usb", 2500);
    expect(result.snapshot(2).percent).toBeCloseTo(96.5);
  });
  it("corrected late delivery has the same result as chronological events", () => {
    const first = new NoteResult([note("a"), note("b", 1)]);
    const late = new NoteResult([note("a"), note("b", 1)]);
    for (const result of [first, late]) strike(result, "a");
    first.release(60, 0.8, "usb");
    strike(first, "b", 1);
    strike(late, "b", 1);
    late.release(60, 0.8, "usb");
    expect(late.snapshot(2)).toEqual(first.snapshot(2));
  });
});

describe("course evidence validation", () => {
  const evidence = {
    policy: NOTE_RESULT_POLICY,
    expectedNotes: 1,
    hitNotes: 1,
    hitPercent: 30,
    holdPercent: 45,
    percent: 75
  };
  it("uses the unrounded 75% boundary", () => {
    expect(passingNoteResult(evidence, 1)).toBe(true);
    expect(passingNoteResult({ ...evidence, holdPercent: 44.999, percent: 74.999 }, 1)).toBe(false);
  });
  it.each([
    undefined,
    { ...evidence, percent: NaN },
    { ...evidence, percent: null },
    { ...evidence, expectedNotes: 0 },
    { ...evidence, expectedNotes: 0.5 },
    { ...evidence, hitNotes: 2 },
    { ...evidence, hitPercent: 75, holdPercent: 0 },
    { ...evidence, holdPercent: 70, percent: 75 },
    { ...evidence, holdPercent: Infinity },
    { ...evidence, percent: 101 },
    { ...evidence, holdPercent: -1 }
  ])("rejects malformed evidence %j", (result) => {
    expect(passingNoteResult(result, 1)).toBe(false);
  });
  it("requires a matching current policy and actual hits", () => {
    expect(passingNoteResult(evidence, 2)).toBe(false);
    expect(passingNoteResult({ ...evidence, policy: "old" }, 1)).toBe(false);
  });
  it("allows recovered holding to exceed the attack count's former hold cap", () => {
    const recovered = {
      ...evidence,
      expectedNotes: 4,
      hitNotes: 3,
      hitPercent: 22.5,
      holdPercent: 60,
      percent: 82.5
    };
    expect(passingNoteResult(recovered, 3)).toBe(true);
    expect(passingNoteResult({ ...recovered, holdPercent: 70.1, percent: 92.6 }, 3)).toBe(false);
  });
});
