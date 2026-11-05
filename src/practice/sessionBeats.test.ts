import { describe, expect, it } from "vitest";
import { PracticeSession, type PracticeOptions } from "./session";
import { sessionLeadIn } from "./sessionBeats";
import type { Song } from "../song/song";
const song: Song = {
  title: "count",
  duration: 2,
  notes: [{ id: "c", pitch: 60, hand: "right", start: 0, duration: 1, startBeat: 0 }],
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 0.5, position: 1, downbeat: false }
  ],
  source: "musicxml",
  measures: [{ start: 0, length: 4, beats: 4, beatType: 4 }]
};
const automatic = { mode: "tempo", speed: 1, hands: new Set() } satisfies PracticeOptions;
describe("explicit automatic count-in", () => {
  it("retains zero implicit or explicit-zero listening lead-in and ordinary player fallback", () => {
    expect(sessionLeadIn(song, automatic, 2)).toBe(0);
    expect(sessionLeadIn(song, { ...automatic, countInBeats: 0 }, 2)).toBe(0);
    expect(sessionLeadIn(song, { ...automatic, hands: new Set(["right"]) }, 2)).toBe(2);
    expect(sessionLeadIn(song, { ...automatic, countInBeats: 4 }, 2)).toBe(2);
  });
  it("emits four musical clicks without any automatic note before time zero", () => {
    const run = new PracticeSession(song, { ...automatic, countInBeats: 4 });
    expect(run.time).toBe(-2);
    const before = [0.01, 0.5, 0.5, 0.5, 0.48].flatMap((delta) => run.advance(delta));
    expect(run.time).toBeCloseTo(-0.01);
    expect(before.filter((event) => event.type === "beat")).toHaveLength(4);
    expect(before.some((event) => event.type === "autoNoteOn")).toBe(false);
    expect(run.advance(0.02)).toContainEqual({ type: "autoNoteOn", pitch: 60 });
  });
});
