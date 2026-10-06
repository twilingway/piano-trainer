// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import { simplifiedSong } from "./arrangement";
import type { Song, SongNote } from "./song";

let counter = 0;
/** A note at `beat` quarters, `length` quarters long, at 120 bpm. */
const note = (pitch: number, beat: number, hand: Hand, length = 1, part?: string): SongNote => ({
  id: `n${String(counter++)}`,
  pitch,
  start: beat / 2,
  duration: length / 2,
  startBeat: beat,
  hand,
  ...(part ? { part } : {})
});

const midiSong = (notes: SongNote[], parts?: Song["parts"]): Song => ({
  title: "test",
  source: "midi",
  notes,
  beats: [],
  measures: [{ start: 0, length: 4, beats: 4, beatType: 4 }],
  duration: 4,
  musicXml: "<score-partwise><fifths>-1</fifths></score-partwise>",
  ...(parts ? { parts } : {})
});

const pitchesAt = (song: Song, beat: number, hand: Hand) =>
  song.notes
    .filter((item) => item.hand === hand && Math.abs(item.startBeat - beat) < 1e-9)
    .map((item) => item.pitch)
    .sort((a, b) => a - b);

describe("simplifiedSong", () => {
  it("keeps the bass and folds two chord notes into the octave over it", () => {
    const song = simplifiedSong(
      midiSong([note(43, 0, "left"), note(55, 0, "left"), note(59, 0, "left"), note(62, 0, "left")])
    );
    // G2 with G3 B3 D4: the octave double goes, the third and fifth come down.
    expect(pitchesAt(song, 0, "left")).toEqual([43, 47, 50]);
  });

  it("keeps the melody on top with at most two notes close under it", () => {
    const song = simplifiedSong(
      midiSong([55, 60, 64, 67, 72].map((pitch) => note(pitch, 0, "right")))
    );
    expect(pitchesAt(song, 0, "right")).toEqual([64, 67, 72]);
  });

  it("leaves a single line as it is", () => {
    const line = [48, 50, 52, 53].map((pitch, beat) => note(pitch, beat, "left"));
    const song = simplifiedSong(midiSong(line));
    expect(song.notes.map((item) => [item.pitch, item.start, item.duration])).toEqual(
      line.map((item) => [item.pitch, item.start, item.duration])
    );
  });

  it("ends a held note at the hand's next start", () => {
    const song = simplifiedSong(midiSong([note(40, 0, "left", 4), note(47, 1, "left")]));
    expect(song.notes.find((item) => item.pitch === 40)?.duration).toBeCloseTo(0.5);
  });

  it("lifts a melody that lies among the left hand's chords", () => {
    const parts: Song["parts"] = [
      { id: "p0", role: "melody", title: "Мелодия", hand: "right" },
      { id: "p1", role: "accompaniment", title: "Аккомпанемент", hand: "left" }
    ];
    const melody = [50, 52, 55, 57].map((pitch, beat) => note(pitch, beat, "right", 1, "p0"));
    const chords = [0, 2].flatMap((beat) =>
      [48, 55, 59].map((pitch) => note(pitch, beat, "left", 2, "p1"))
    );
    const song = simplifiedSong(midiSong([...melody, ...chords], parts));
    expect(pitchesAt(song, 0, "right")).toEqual([62]);
    expect(pitchesAt(song, 0, "left")).toEqual([48, 55, 59]);
    expect(song.parts).toBe(parts);
  });

  it("writes its own score, in the original's key, and marks itself simplified", () => {
    const song = simplifiedSong(
      midiSong([note(60, 0, "right"), note(64, 0, "right"), note(48, 0, "left")])
    );
    expect(song.simplified).toBe(true);
    expect(song.musicXml).toContain("<fifths>-1</fifths>");
    expect(song.notes.every((item) => item.sourceIndex !== undefined)).toBe(true);
  });

  it("brings a note beyond the piano's keys in by octaves", () => {
    const song = simplifiedSong(midiSong([note(112, 0, "right"), note(16, 0, "left")]));
    expect(song.notes.map((item) => item.pitch).sort((a, b) => a - b)).toEqual([28, 100]);
  });

  it("returns a song from a score untouched", () => {
    const score: Song = { ...midiSong([note(60, 0, "right")]), source: "musicxml" };
    expect(simplifiedSong(score)).toBe(score);
  });
});
