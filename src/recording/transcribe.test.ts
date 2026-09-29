// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { songFromMusicXml } from "../song/musicxml";
import type { Song, SongNote } from "../song/song";
import { compareTake } from "./compare";
import type { PlayedNote, Take } from "./take";
import { quartersAt } from "../song/song";
import { transcribeTake } from "./transcribe";

const note = (id: string, pitch: number, start: number, duration: number): SongNote => ({
  id,
  pitch,
  start,
  duration,
  startBeat: start,
  hand: "right"
});

// 4/4 at one quarter a second: song seconds and quarter notes are the same numbers.
const SONG: Song = {
  title: "Проба",
  source: "musicxml",
  notes: [
    note("c", 60, 0, 1),
    note("d", 62, 1, 0.5),
    note("e", 64, 1.5, 2),
    note("f", 65, 3.5, 1.5)
  ],
  beats: Array.from({ length: 8 }, (_, index) => ({
    time: index,
    position: index,
    downbeat: index % 4 === 0
  })),
  measures: [
    { start: 0, length: 4, beats: 4, beatType: 4 },
    { start: 4, length: 4, beats: 4, beatType: 4 }
  ],
  duration: 5
};

const played = (pitch: number, start: number, end: number): PlayedNote => ({
  pitch,
  velocity: 70,
  start,
  end,
  realStart: start,
  realEnd: end
});

const take = (notes: PlayedNote[], mode: Take["mode"] = "tempo"): Take => ({
  id: "t",
  songKey: "Проба",
  createdAt: "2026-09-30T00:00:00Z",
  mode,
  speed: 1,
  hands: ["right"],
  from: 0,
  notes,
  pedal: []
});

/** The transcription read back: pitch, start and length in quarters, ties merged. */
function readBack(xml: string): number[][] {
  // The written score has no tempo mark: 120 per quarter, two quarters a second.
  return songFromMusicXml(xml, "back").notes.map((item) => [
    item.pitch,
    item.startBeat,
    Math.round(item.duration * 2 * 100) / 100
  ]);
}

describe("quartersAt", () => {
  it("reads quarters off the beat grid and keeps its tempo past the edges", () => {
    expect(quartersAt(SONG, 2.5)).toBe(2.5);
    expect(quartersAt(SONG, -1)).toBe(-1);
    expect(quartersAt(SONG, 9)).toBe(9);
  });
});

describe("transcribeTake", () => {
  it("writes the keys as they were held, rounded to sixteenths, tied across the bar", () => {
    const performance = take([
      played(60, 0.02, 0.98),
      // Let go early: an eighth held for a sixteenth and a bit.
      played(62, 1, 1.3),
      played(64, 1.52, 3.49),
      // Across the barline: written as tied notes, read back as one.
      played(65, 3.5, 5)
    ]);
    const { musicXml } = transcribeTake(SONG, performance, compareTake(SONG, performance));
    expect(readBack(musicXml)).toEqual([
      [60, 0, 1],
      [62, 1, 0.25],
      [64, 1.5, 2],
      [65, 3.5, 1.5]
    ]);
  });

  it("grades each written note by the review, and a key that matched nothing as extra", () => {
    const performance = take([played(60, 0, 1), played(61, 1, 1.5)]);
    const { grades } = transcribeTake(SONG, performance, compareTake(SONG, performance));
    expect(grades.get("0:60")).toBe("good");
    expect(grades.get("1:61")).toBe("extra");
  });

  it("places a wait-mode key on the note it answered, as long as the finger held it", () => {
    // The song stood at 1 s while D4 was found; it was held for half a second of real time.
    const waited: PlayedNote = {
      pitch: 62,
      velocity: 70,
      start: 1,
      end: 1,
      realStart: 3,
      realEnd: 3.5
    };
    const performance = take([waited], "wait");
    const { musicXml } = transcribeTake(SONG, performance, compareTake(SONG, performance));
    expect(readBack(musicXml)).toEqual([[62, 1, 0.5]]);
  });
});
