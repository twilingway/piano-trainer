import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { keyLightPitches } from "./keyLights";
import { LEAD_IN_S, PracticeSession } from "./session";
import type { PracticeMode } from "./session";

const note = (id: string, pitch: number, start: number, hand: Hand = "right"): SongNote => ({
  id,
  pitch,
  start,
  duration: 0.5,
  startBeat: start,
  hand
});

// Right hand: C4 at 0, an E4-G4 chord at 1, C4 twice at 2. Left hand: C3 at 0.
const SONG: Song = {
  title: "test",
  source: "midi",
  notes: [
    note("c3", 48, 0, "left"),
    note("c4", 60, 0),
    note("e4", 64, 1),
    note("g4", 67, 1),
    note("c4a", 60, 2),
    note("c4b", 60, 2.01)
  ],
  measures: [],
  beats: [],
  duration: 3
};

const session = (mode: PracticeMode, speed = 1) =>
  new PracticeSession(SONG, { mode, hands: new Set<Hand>(["right"]), speed });

describe("keyLightPitches", () => {
  it("lights nothing while inactive", () => {
    expect(keyLightPitches(session("wait"), false)).toEqual([]);
  });

  it("lights the owed chord in the wait mode, and drops a pressed key", () => {
    const run = session("wait");
    // The next chord lights long before the song reaches it.
    expect(keyLightPitches(run, true)).toEqual([60]);
    run.advance(LEAD_IN_S);
    run.pressKey(60);
    expect(keyLightPitches(run, true)).toEqual([64, 67]);
    run.advance(1);
    run.pressKey(64);
    expect(keyLightPitches(run, true)).toEqual([67]);
  });

  it("lights one key for two notes on it", () => {
    const run = session("wait");
    run.advance(LEAD_IN_S);
    run.pressKey(60);
    run.advance(1);
    run.pressKey(64);
    run.pressKey(67);
    expect(keyLightPitches(run, true)).toEqual([60]);
  });

  it("lights the tempo mode's notes 300 ms ahead and drops a missed one", () => {
    const run = session("tempo");
    run.advance(LEAD_IN_S - 0.5);
    expect(keyLightPitches(run, true)).toEqual([]);
    run.advance(0.25);
    expect(keyLightPitches(run, true)).toEqual([60]);
    run.advance(1);
    // C4 is missed by now; the chord at 1 is 250 ms away.
    expect(keyLightPitches(run, true)).toEqual([64, 67]);
  });

  it("scales the tempo window with the speed so it stays 300 ms of real time", () => {
    const run = session("tempo", 0.5);
    // At half speed 0.2 s of song before C4 is 400 ms away; 0.1 s is 200 ms.
    run.advance((LEAD_IN_S - 0.2) / 0.5);
    expect(keyLightPitches(run, true)).toEqual([]);
    run.advance(0.1 / 0.5);
    expect(keyLightPitches(run, true)).toEqual([60]);
  });

  it("never lights the other hand's notes", () => {
    const run = session("tempo");
    run.advance(LEAD_IN_S);
    expect(keyLightPitches(run, true)).not.toContain(48);
  });
});
