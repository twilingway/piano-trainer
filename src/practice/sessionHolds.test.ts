import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { SessionHolds } from "./sessionHolds";
import { SessionScoring } from "./sessionScoring";

const note = (id: string, start: number, duration = 2): SongNote => ({
  id,
  start,
  duration,
  pitch: 60,
  startBeat: start,
  hand: "right"
});
const setup = (notes: SongNote[]) => {
  const score = new SessionScoring(notes, "normal");
  const holds = new SessionHolds(
    notes,
    (id, ticks, at) => {
      score.hold(id, ticks, at);
    },
    (id, until) => {
      score.truncateHold(id, until);
    }
  );
  return { holds, score };
};

describe("physical hold history", () => {
  it("a delayed Off A cannot release newer On B on the same key", () => {
    const a = note("a", 0, 1);
    const b = note("b", 1);
    const { holds, score } = setup([a, b]);
    score.hit("a", 0, 0);
    holds.start(a, 0, "usb");
    score.hit("b", 0, 1);
    holds.start(b, 1, "usb");
    holds.release(60, 0.9, "usb");
    holds.update(1.5);
    expect(score.snapshot(2).holdScore).toBe(140);
    expect(holds.snapshot(1.5).heldSeconds).toBeCloseTo(1.4);
    expect(holds.snapshot(1.5).meanReleaseOffsetMs).toBeCloseTo(-100);
  });
  it("tracks two MIDI devices separately and excludes the paused interval", () => {
    const a = note("a", 0);
    const b = note("b", 0);
    const { holds, score } = setup([a, b]);
    score.hit("a", 0, 0);
    score.hit("b", 0, 0);
    holds.start(a, 0, "usb");
    holds.start(b, 0, "ble");
    holds.release(60, 0.2, "usb");
    holds.stop(0.5);
    holds.update(10);
    expect(score.snapshot(10).holdScore).toBe(70);
    expect(holds.snapshot(10).heldSeconds).toBeCloseTo(0.7);
    expect(holds.snapshot(10).accuracy).toBeCloseTo(17.5);
  });
  it("reports unavailable metrics for a song without long notes", () => {
    const { holds } = setup([note("a", 0, 0.2)]);
    expect(holds.snapshot(10).accuracy).toBeNull();
    expect(holds.snapshot(10).meanReleaseOffsetMs).toBeNull();
  });
  it("uses performance boundaries to distinguish a resumed attack at the same song time", () => {
    const a = note("a", 0.5);
    const { holds, score } = setup([a]);
    holds.stop(0.5, 500);
    score.hit("a", 0, 0.5);
    holds.start(a, 0.5, "usb", 1500);
    holds.update(0.7);
    expect(score.snapshot(1).holdScore).toBe(20);
  });
});
