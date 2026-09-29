import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import type { Song, SongNote } from "../song/song";
import { compareTake } from "./compare";
import { takeAsSong, takeToMidi } from "./playback";
import type { Take } from "./take";

const note = (id: string, pitch: number, start: number, hand: SongNote["hand"]): SongNote => ({
  id,
  pitch,
  start,
  duration: 1,
  startBeat: start * 2,
  hand
});

const SONG: Song = {
  title: "test",
  source: "musicxml",
  notes: [note("c", 60, 0, "right"), note("d", 62, 1, "right"), note("low", 50, 1, "left")],
  beats: [],
  duration: 2
};

const TAKE: Take = {
  id: "t",
  songKey: "test",
  createdAt: "2026-09-29T00:00:00Z",
  mode: "tempo",
  speed: 1,
  hands: ["right"],
  from: 0,
  notes: [
    { pitch: 60, velocity: 64, start: 0, end: 0.9, realStart: 0.2, realEnd: 1.1 },
    { pitch: 62, velocity: 100, start: 1.5, end: 1.5, realStart: 1.7, realEnd: 1.7 }
  ],
  pedal: [{ start: 0, end: 1, realStart: 0.2, realEnd: 1.2 }]
};

describe("takeAsSong", () => {
  it("places the keys on the score's timeline with their velocity and beat", () => {
    const song = takeAsSong(TAKE, SONG, compareTake(SONG, TAKE));
    expect(song.notes.map((item) => [item.pitch, item.start, item.velocity, item.hand])).toEqual([
      [60, 0, 64, "right"],
      [62, 1.5, 100, "right"]
    ]);
    // No score note starts after 1 s (beat 2), so a key at 1.5 s keeps that beat.
    expect(song.notes[1]?.startBeat).toBe(2);
    // A key held for no song time still sounds and shows for a moment.
    expect(song.notes[1]?.duration).toBeGreaterThan(0);
  });
});

describe("takeToMidi", () => {
  it("writes the take in real time with velocity and the pedal", () => {
    const midi = new Midi(takeToMidi(TAKE, "test"));
    const [track] = midi.tracks;
    expect(track?.notes.map((item) => [item.midi, Math.round(item.time * 100) / 100])).toEqual([
      [60, 0.2],
      [62, 1.7]
    ]);
    expect(Math.round((track?.notes[1]?.velocity ?? 0) * 127)).toBe(100);
    const pedal = track?.controlChanges[64] ?? [];
    expect(pedal.map((item) => item.value)).toEqual([1, 0]);
  });
});
