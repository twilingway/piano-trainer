import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { LEAD_IN_S, PracticeSession } from "./session";
import type { PracticeOptions } from "./session";

const note = (id: string, pitch: number, start: number, hand: Hand, part: string): SongNote => ({
  id,
  pitch,
  start,
  duration: 0.5,
  startBeat: start,
  hand,
  part
});

const CHORD = note("chord", 55, 0, "left", "p1");

// The melody in the right hand; chords and a bass both in the left.
const SONG: Song = {
  title: "parts",
  source: "midi",
  notes: [
    note("bass", 40, 0, "left", "p2"),
    CHORD,
    note("tune", 50, 0, "right", "p0"),
    note("bass2", 43, 1, "left", "p2")
  ],
  measures: [],
  beats: [],
  duration: 1.5
};

const session = (options: Partial<PracticeOptions> & Pick<PracticeOptions, "hands">) =>
  new PracticeSession(SONG, { mode: "wait", speed: 1, ...options });

const sounded = (run: PracticeSession, seconds: number) =>
  run
    .advance(seconds)
    .flatMap((event) => (event.type === "autoNoteOn" ? [event.pitch] : []))
    .sort((a, b) => a - b);

describe("a chosen part", () => {
  it("is all the player owes; the rest of its hand is the program's", () => {
    const run = session({ hands: new Set<Hand>(["left"]), parts: new Set(["p2"]) });
    expect(sounded(run, LEAD_IN_S)).toEqual([50, 55]);
    expect(run.nextDue().map((item) => item.id)).toEqual(["bass"]);
    expect(run.owns(CHORD)).toBe(false);
  });
});

describe("accompaniment", () => {
  it("is silent when switched off while the player plays", () => {
    const run = session({ hands: new Set<Hand>(["right"]), accompaniment: false, mode: "tempo" });
    expect(sounded(run, LEAD_IN_S + 2)).toEqual([]);
  });

  it("plays the rest of the song when on", () => {
    const run = session({ hands: new Set<Hand>(["right"]), mode: "tempo" });
    expect(sounded(run, LEAD_IN_S + 2)).toEqual([40, 43, 55]);
  });

  it("still sounds the whole song while listening", () => {
    const run = session({ hands: new Set<Hand>(), accompaniment: false, mode: "tempo" });
    expect(sounded(run, 2)).toEqual([40, 43, 50, 55]);
  });
});
