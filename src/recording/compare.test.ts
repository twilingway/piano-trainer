import { describe, expect, it } from "vitest";

import type { Song, SongNote } from "../song/song";
import { compareTake } from "./compare";
import type { PlayedNote, Take } from "./take";

const note = (id: string, pitch: number, start: number, duration = 1): SongNote => ({
  id,
  pitch,
  start,
  duration,
  startBeat: start,
  hand: "right"
});

// C4 D4 E4 F4, one second each.
const SONG: Song = {
  title: "test",
  source: "musicxml",
  notes: [note("c", 60, 0), note("d", 62, 1), note("e", 64, 2), note("f", 65, 3)],
  beats: [],
  duration: 4
};

const played = (pitch: number, start: number, end: number, velocity = 70): PlayedNote => ({
  pitch,
  velocity,
  start,
  end,
  realStart: start,
  realEnd: end
});

const take = (notes: PlayedNote[], mode: Take["mode"] = "tempo", from = 0): Take => ({
  id: "t",
  songKey: "test",
  createdAt: "2026-09-29T00:00:00Z",
  mode,
  speed: 1,
  hands: ["right"],
  from,
  notes,
  pedal: []
});

describe("compareTake", () => {
  it("passes a clean take", () => {
    const review = compareTake(
      SONG,
      take([played(60, 0, 0.95), played(62, 1.02, 1.9), played(64, 2, 2.9), played(65, 2.97, 3.9)])
    );
    expect(review.notes.map((item) => item.grade)).toEqual(["good", "good", "good", "good"]);
    expect(review.summary).toMatchObject({ owed: 4, good: 4, missed: 0, extras: 0 });
  });

  it("finds a missed note, a wrong key, a late note and a note released early", () => {
    const review = compareTake(
      SONG,
      take([
        played(60, 0, 0.95),
        // Wrong key where D4 belongs: D4 is missed and the C#4 is extra.
        played(61, 1, 1.9),
        // E4 150 ms late.
        played(64, 2.15, 2.95),
        // F4 let go after a third of its length.
        played(65, 3, 3.3)
      ])
    );
    const byId = new Map(review.notes.map((item) => [item.note.id, item]));
    expect(byId.get("d")?.grade).toBe("missed");
    expect(review.extras.map((item) => item.pitch)).toEqual([61]);
    expect(byId.get("e")).toMatchObject({ grade: "inaccurate", timing: "late" });
    expect(byId.get("e")?.offsetMs).toBeCloseTo(150);
    expect(byId.get("f")).toMatchObject({ grade: "inaccurate", held: "short", timing: "ok" });
  });

  it("flags a key struck much harder than the player's own average", () => {
    const review = compareTake(
      SONG,
      take([
        played(60, 0, 0.95, 60),
        played(62, 1, 1.95, 62),
        played(64, 2, 2.95, 120),
        played(65, 3, 3.95, 58)
      ])
    );
    expect(review.notes.map((item) => item.loudness)).toEqual(["ok", "ok", "loud", "ok"]);
  });

  it("judges only notes and touch in wait mode, where the song waited for the key", () => {
    // Held a long time and "late" by the clock: in wait mode neither counts.
    const review = compareTake(SONG, take([played(60, 0, 3), played(62, 1, 1.1)], "wait"));
    expect(review.notes.slice(0, 2).map((item) => item.grade)).toEqual(["good", "good"]);
    expect(review.notes[0]?.timing).toBeUndefined();
    expect(review.notes[0]?.held).toBeUndefined();
  });

  it("owes nothing before the point the take started from", () => {
    const review = compareTake(SONG, take([played(64, 2, 2.9), played(65, 3, 3.9)], "tempo", 2));
    expect(review.summary).toMatchObject({ owed: 2, good: 2, missed: 0 });
  });
});
