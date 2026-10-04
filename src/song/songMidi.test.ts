// @vitest-environment happy-dom
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import { songFromMusicXml } from "./musicxml";
import type { Song, SongNote } from "./song";
import { songToMidi } from "./songMidi";

const anthemXml = EXERCISES.find((item) => item.id === "anthem-ru")?.levels[0]?.musicXml ?? "";

const note = (id: string, pitch: number, startBeat: number, hand: SongNote["hand"]): SongNote => ({
  id,
  pitch,
  start: startBeat / 2,
  duration: 0.5,
  startBeat,
  hand
});

/** Two beats at 120 bpm, then two at 60. */
const SLOWING: Song = {
  title: "slowing",
  source: "musicxml",
  notes: [note("a", 60, 0, "right"), note("b", 62, 1, "right"), note("c", 64, 2, "right")],
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 0.5, position: 1, downbeat: false },
    { time: 1, position: 2, downbeat: true },
    { time: 2, position: 3, downbeat: false },
    { time: 3, position: 4, downbeat: true }
  ],
  measures: [
    { start: 0, length: 2, beats: 2, beatType: 4 },
    { start: 2, length: 2, beats: 2, beatType: 4 }
  ],
  duration: 3
};

describe("songToMidi", () => {
  it("writes every note of the anthem on the score's beats, hands on their own tracks", () => {
    const song = songFromMusicXml(anthemXml, "Гимн России");
    const midi = new Midi(songToMidi(song));
    const nameBytes = Uint8Array.from(midi.header.name, (char) => char.charCodeAt(0));
    expect(new TextDecoder().decode(nameBytes)).toBe("Гимн России");
    // MIDI keeps tempo as whole microseconds a quarter: 76 bpm reads back a hair off.
    expect(midi.header.tempos).toHaveLength(1);
    expect(midi.header.tempos[0]?.bpm).toBeCloseTo(76, 3);
    expect(midi.header.timeSignatures[0]?.timeSignature).toEqual([
      song.measures[0]?.beats,
      song.measures[0]?.beatType
    ]);
    expect(midi.tracks.map((track) => track.name)).toEqual(["Right hand", "Left hand"]);
    const ppq = midi.header.ppq;
    for (const [index, hand] of (["right", "left"] as const).entries()) {
      const expected = song.notes.filter((item) => item.hand === hand);
      const written = midi.tracks[index]?.notes ?? [];
      expect(written).toHaveLength(expected.length);
      expected.forEach((item, at) => {
        expect(written[at]?.midi).toBe(item.pitch);
        expect(written[at]?.ticks).toBe(Math.round(item.startBeat * ppq));
        expect(written[at]?.time).toBeCloseTo(item.start, 3);
        expect(written[at]?.duration).toBeCloseTo(item.duration, 2);
      });
    }
  });

  it("follows tempo changes in the beat grid", () => {
    const midi = new Midi(songToMidi(SLOWING));
    const ppq = midi.header.ppq;
    expect(midi.header.tempos.map(({ ticks, bpm }) => ({ ticks, bpm }))).toEqual([
      { ticks: 0, bpm: 120 },
      { ticks: 2 * ppq, bpm: 60 }
    ]);
    expect(midi.tracks[0]?.notes.map((item) => item.ticks)).toEqual([0, ppq, 2 * ppq]);
    expect(midi.header.timeSignatures).toHaveLength(1);
  });

  it("leaves out the track of a hand that does not play", () => {
    const midi = new Midi(songToMidi(SLOWING));
    expect(midi.tracks.map((track) => track.name)).toEqual(["Right hand"]);
  });
});
