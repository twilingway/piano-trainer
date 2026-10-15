import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import { PracticeSession } from "./session";
import { HELD_BASS_PRACTICE_OPTIONS, isHeldBassScope } from "./heldBassPolicy";
import type { ScopedVerifiedOnset, VerifiedOnsetScope } from "./verifiedWaitingOnset";

const song: Song = {
  title: "held",
  source: "midi",
  measures: [],
  beats: [],
  duration: 1,
  notes: [
    { id: "bass", pitch: 48, hand: "left", start: 0, startBeat: 0, duration: 1 },
    { id: "r0", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "r1", pitch: 62, hand: "right", start: 0.5, startBeat: 1, duration: 0.5 }
  ]
};
const scope: VerifiedOnsetScope = {
  runId: "run",
  presentationId: "shown",
  fragmentId: "fragment",
  steps: [["bass", "r0"], ["r1"]]
};
const request = (step = 0): ScopedVerifiedOnset => ({
  runId: "run",
  presentationId: "shown",
  fragmentId: "fragment",
  step,
  noteIds: scope.steps[step] ?? []
});
function create() {
  const session = new PracticeSession(song, HELD_BASS_PRACTICE_OPTIONS);
  expect(session.registerVerifiedOnsets(scope)).toBe(true);
  session.startClock(1000);
  session.tick(3000);
  return session;
}
describe("scoped held-bass onset and clock", () => {
  it("rejects an old retry presentation even when the run, fragment, step and IDs repeat", () => {
    const session = new PracticeSession(song, HELD_BASS_PRACTICE_OPTIONS);
    expect(session.registerVerifiedOnsets({ ...scope, presentationId: "retry" })).toBe(true);
    session.advance(2);
    expect(
      session.commitVerifiedOnset({ ...request(), presentationId: "retry" }, 3000)
    ).toBeUndefined();
    session.startClock(3000);
    session.tick(3000);
    const before = session.clockReceipt(3000);
    expect(session.commitVerifiedOnset(request(), 3000)).toBeUndefined();
    expect(session.clockReceipt(3000)).toEqual(before);
    expect(
      session.commitVerifiedOnset({ ...request(), presentationId: "retry" }, 3100)
    ).toHaveLength(2);
  });

  it("exports an explicit bounded overflow witness instead of a valid shortened clock trace", () => {
    const session = create();
    for (let index = 0; index < 80; index++) {
      session.pauseClock(3000 + index);
      session.resumeClock(3000 + index);
    }
    expect(session.clockReceipt(3100).segments).toHaveLength(65);
  });

  it("accepts exact two then singleton, with one clock and no ordinary judgement", () => {
    const session = create();
    expect(session.commitVerifiedOnset(request(), 3200)).toHaveLength(2);
    expect(session.time).toBe(0);
    expect(session.clockReceipt(3350).songTime).toBeCloseTo(0.15);
    session.tick(4000);
    expect(session.time).toBe(0.5);
    expect(session.commitWaitingGroup(["r1"], 4000)).toBeUndefined();
    expect(session.commitVerifiedOnset(request(1), 4100)).toHaveLength(1);
    session.tick(5000);
    expect(session.finished).toBe(true);
    expect(session.time).toBe(1);
    expect(session.stats().hits).toBe(3);
    expect(session.stats().wrong).toBe(0);
    expect(session.stats().noteResult).toBeUndefined();
    expect(session.clockReceipt(6000).segments.at(-1)).toEqual({
      performanceMs: 4600,
      songSeconds: 1,
      speed: 0,
      acceptsInput: true
    });
  });

  it("rejects stale scope/step/subsets/duplicates/future ids and bad time without mutation", () => {
    const session = create();
    const before = session.clockReceipt(3000);
    const attempts: ScopedVerifiedOnset[] = [
      { ...request(), runId: "old" },
      { ...request(), fragmentId: "old" },
      { ...request(), presentationId: "old" },
      request(1),
      { ...request(), noteIds: ["bass"] },
      { ...request(), noteIds: ["bass", "bass"] },
      { ...request(), noteIds: ["bass", "r1"] }
    ];
    for (const invalid of attempts)
      expect(session.commitVerifiedOnset(invalid, 3000)).toBeUndefined();
    for (const at of [2999, NaN, Infinity])
      expect(session.commitVerifiedOnset(request(), at)).toBeUndefined();
    expect(session.clockReceipt(3000)).toEqual(before);
    expect(session.stats().hits).toBe(0);
    session.pauseClock(3100);
    expect(session.commitVerifiedOnset(request(), 3200)).toBeUndefined();
    session.resumeClock(3300);
    expect(session.commitVerifiedOnset(request(), 3300)).toHaveLength(2);
    expect(session.commitVerifiedOnset(request(), 3300)).toBeUndefined();
    session.tick(3800);
    expect(session.commitVerifiedOnset(request(1), 3800)).toHaveLength(1);
    session.tick(4300);
    expect(session.commitVerifiedOnset(request(1), 4400)).toBeUndefined();
  });

  it("rejects unregistered ordinary modes and malformed registrations", () => {
    const ordinary = new PracticeSession(song, HELD_BASS_PRACTICE_OPTIONS);
    ordinary.advance(2);
    expect(ordinary.commitVerifiedOnset(request(), 3000)).toBeUndefined();
    for (const options of [
      { ...HELD_BASS_PRACTICE_OPTIONS, noteResult: true },
      { ...HELD_BASS_PRACTICE_OPTIONS, speed: 0.75 },
      { ...HELD_BASS_PRACTICE_OPTIONS, mode: "tempo" as const },
      { ...HELD_BASS_PRACTICE_OPTIONS, accompaniment: true }
    ])
      expect(new PracticeSession(song, options).registerVerifiedOnsets(scope)).toBe(false);
    const fresh = new PracticeSession(song, HELD_BASS_PRACTICE_OPTIONS);
    expect(fresh.registerVerifiedOnsets({ ...scope, steps: [["bass", "r1"], ["r0"]] })).toBe(false);
    expect(fresh.registerVerifiedOnsets(scope)).toBe(true);
    expect(fresh.registerVerifiedOnsets({ ...scope, runId: "replacement" })).toBe(false);
  });

  it("registers four quarters and commits exactly four scoped onset groups", () => {
    const longSong: Song = {
      ...song,
      duration: 2,
      notes: [
        ...song.notes.map((note) => (note.hand === "left" ? { ...note, duration: 2 } : note)),
        { id: "r2", pitch: 64, hand: "right", start: 1, startBeat: 2, duration: 0.5 },
        { id: "r3", pitch: 65, hand: "right", start: 1.5, startBeat: 3, duration: 0.5 }
      ]
    };
    const longScope = { ...scope, steps: [...scope.steps, ["r2"], ["r3"]] };
    const session = new PracticeSession(longSong, HELD_BASS_PRACTICE_OPTIONS);
    expect(session.registerVerifiedOnsets(longScope)).toBe(true);
    session.startClock(1000);
    for (let step = 0; step < 4; step++) {
      const at = 3000 + step * 600;
      session.tick(at);
      expect(
        session.commitVerifiedOnset({ ...request(step), noteIds: longScope.steps[step] ?? [] }, at)
      ).toHaveLength(step === 0 ? 2 : 1);
    }
    session.tick(5300);
    expect(session.time).toBe(2);
    expect(session.finished).toBe(true);
  });

  it.each([1000 / 15, 1000 / 60])(
    "clips between-frame readiness exactly at pending onset (%s ms)",
    (frameMs) => {
      const session = create();
      session.commitVerifiedOnset(request(), 3200);
      for (let at = 3200; at < 3650; at += frameMs) session.tick(at);
      const before = session.time;
      expect(session.clockReceipt(3699).waiting).toBe(false);
      expect(session.clockReceipt(3700).waiting).toBe(true);
      expect(session.clockReceipt(3800).songTime).toBe(0.5);
      expect(session.time).toBe(before);
      session.tick(3800);
      expect(session.clockReceipt(3800).segments.at(-1)?.performanceMs).toBe(3700);
    }
  );

  it("uses musical end without adding input grace and keeps historical receipts immutable", () => {
    const session = create();
    session.setInputGrace(80);
    session.commitVerifiedOnset(request(), 3200);
    session.tick(3700);
    session.commitVerifiedOnset(request(1), 4000);
    const snapshot = session.clockReceipt(4499);
    expect(snapshot.ended).toBe(false);
    expect(session.clockReceipt(4500).ended).toBe(true);
    session.tick(4600);
    expect(session.time).toBe(1);
    expect(session.clockReceipt(6000).songTime).toBe(1);
    expect(snapshot.segments.at(-1)?.speed).toBe(1);
    if (snapshot.segments[0]) Reflect.set(snapshot.segments[0], "performanceMs", -999);
    expect(session.clockReceipt(4600).segments[0]?.performanceMs).toBe(1000);
  });
});

describe("held-bass scope shape", () => {
  it("is checked by the course while the session keeps only generic onset invariants", () => {
    expect(isHeldBassScope(scope, song, HELD_BASS_PRACTICE_OPTIONS)).toBe(true);
    const melodyFirst: Song = {
      ...song,
      notes: song.notes.map((note) => (note.id === "bass" ? { ...note, hand: "right" } : note))
    };
    expect(isHeldBassScope(scope, melodyFirst, HELD_BASS_PRACTICE_OPTIONS)).toBe(false);
    expect(
      isHeldBassScope(scope, song, { ...HELD_BASS_PRACTICE_OPTIONS, hands: new Set(["right"]) })
    ).toBe(false);
    expect(isHeldBassScope(scope, { ...song, duration: 1.5 }, HELD_BASS_PRACTICE_OPTIONS)).toBe(
      false
    );
    const three: Song = {
      ...song,
      duration: 1.5,
      notes: [
        ...song.notes,
        { id: "r2", pitch: 64, hand: "right", start: 1, startBeat: 2, duration: 0.5 }
      ]
    };
    const threeScope = { ...scope, steps: [...scope.steps, ["r2"]] };
    expect(isHeldBassScope(threeScope, three, HELD_BASS_PRACTICE_OPTIONS)).toBe(false);
    expect(
      new PracticeSession(three, HELD_BASS_PRACTICE_OPTIONS).registerVerifiedOnsets(threeScope)
    ).toBe(true);
  });
});
