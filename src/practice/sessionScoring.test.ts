import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { SessionScoring } from "./sessionScoring";

const notes: SongNote[] = Array.from({ length: 12 }, (_, index) => ({
  id: String(index),
  pitch: 60 + index,
  start: index * 0.1,
  duration: 0.5,
  startBeat: index,
  hand: "right"
}));

describe("chronological score log", () => {
  it("activates Overdrive once when the chronological cache is current", () => {
    const expected = Array.from({ length: 25 }, (_, index) => ({
      ...notes[0],
      id: String(index),
      pitch: 60,
      start: index * 0.1,
      duration: 0.5,
      startBeat: index,
      hand: "right" as const
    }));
    const score = new SessionScoring(expected, "normal");
    for (let index = 0; index < 25; index++) score.hit(String(index), 0, index * 0.1);
    expect(score.activateOverdrive(5)).toBe(true);
    expect(score.snapshot(5).energy).toBe(75);
    expect(score.snapshot(5).overdriveActive).toBe(true);
    expect(score.activateOverdrive(5.1)).toBe(false);
  });
  it("replays reordered attack callbacks before misses and holds at their event time", () => {
    const ordered = new SessionScoring(notes, "normal");
    const reversed = new SessionScoring(notes, "normal");
    for (const note of notes.slice(0, 10)) ordered.hit(note.id, 0, note.start);
    ordered.hold("0", 1, 0.1);
    ordered.miss("10", 1.15);
    ordered.hit("11", 0, 1.2);
    reversed.hit("11", 0, 1.2);
    reversed.miss("10", 1.15);
    reversed.hold("0", 1, 0.1);
    for (const note of notes.slice(0, 10).reverse()) reversed.hit(note.id, 0, note.start);
    expect(reversed.snapshot(2)).toEqual(ordered.snapshot(2));
    expect(ordered.snapshot(2).holdScore).toBe(10);
    expect(ordered.snapshot(2).combo).toBe(1);
  });
  it("retracts hold ticks after a delayed physical Note Off", () => {
    const score = new SessionScoring(notes.slice(0, 1), "normal");
    score.hit("0", 0, 0);
    score.hold("0", 1, 0.1);
    score.hold("0", 2, 0.2);
    score.hold("0", 3, 0.3);
    score.truncateHold("0", 0.25);
    expect(score.snapshot(1).holdScore).toBe(20);
  });
});
