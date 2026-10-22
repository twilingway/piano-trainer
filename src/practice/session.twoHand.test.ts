import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import { PracticeSession } from "./session";

const song: Song = {
  title: "pairs",
  source: "midi",
  measures: [],
  notes: [
    { id: "l0", pitch: 48, hand: "left", start: 0, startBeat: 0, duration: 0.5 },
    { id: "r0", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 0.5 },
    { id: "l1", pitch: 50, hand: "left", start: 0.5, startBeat: 1, duration: 0.5 },
    { id: "r1", pitch: 62, hand: "right", start: 0.5, startBeat: 1, duration: 0.5 }
  ],
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 0.5, position: 1, downbeat: false }
  ],
  duration: 1
};
const create = () =>
  new PracticeSession(song, {
    mode: "wait",
    hands: new Set(["left", "right"]),
    speed: 1,
    noteResult: false,
    accompaniment: false
  });

describe("verified waiting pair commit", () => {
  it("rejects subsets, duplicate and stale IDs without any mutation", () => {
    const session = create();
    session.advance(2);
    const before = session.stats();
    for (const ids of [["l0"], ["l0", "l0"], ["l0", "r1"], ["l1", "r1"]]) {
      expect(session.commitWaitingGroup(ids, 3000)).toBeUndefined();
      expect(session.stats()).toEqual(before);
      expect(session.nextDue().map((note) => note.id)).toEqual(["l0", "r0"]);
    }
  });
  it("accepts both IDs atomically once and advances only the shared clock", () => {
    const session = create();
    session.startClock(1000);
    session.tick(3000);
    expect(session.time).toBe(0);
    expect(session.commitWaitingGroup(["r0", "l0"], 4000)).toHaveLength(2);
    expect(session.stats().hits).toBe(2);
    expect(session.time).toBe(0);
    expect(session.commitWaitingGroup(["l0", "r0"], 4000)).toBeUndefined();
    session.tick(4100);
    expect(session.time).toBeCloseTo(0.1);
    session.tick(5000);
    expect(session.time).toBe(0.5);
    expect(session.nextDue().map((note) => note.id)).toEqual(["l1", "r1"]);
  });
  it("refuses paused, early or invalid-time commits", () => {
    const session = create();
    expect(session.commitWaitingGroup(["l0", "r0"], 1000)).toBeUndefined();
    session.startClock(1000);
    session.tick(3000);
    for (const now of [NaN, Infinity, 2999])
      expect(session.commitWaitingGroup(["l0", "r0"], now)).toBeUndefined();
    session.pauseClock(3500);
    expect(session.commitWaitingGroup(["l0", "r0"], 3600)).toBeUndefined();
    expect(session.stats().hits).toBe(0);
  });
});
