import { describe, expect, it } from "vitest";

import type { Song, SongBeat, SongMeasure } from "../song/song";
import { scoreboard } from "./scoreboard";

/** 32 measures of 4/4 at 120: a quarter every half second. */
function song(pickup = false): Song {
  const beats: SongBeat[] = [];
  for (let quarter = 0; quarter <= 32 * 4; quarter++) {
    beats.push({ time: quarter * 0.5, position: quarter, downbeat: quarter % 4 === 0 });
  }
  const measures: SongMeasure[] = [];
  if (pickup) measures.push({ start: 0, length: 1, beats: 4, beatType: 4 });
  const from = pickup ? 1 : 0;
  for (let index = 0; index < 32; index++) {
    measures.push({ start: from + index * 4, length: 4, beats: 4, beatType: 4 });
  }
  return { title: "t", source: "musicxml", notes: [], beats, measures, duration: 64 };
}

describe("scoreboard", () => {
  it("shows the measure out of all and the tempo at the chosen speed", () => {
    // Three measures of four quarters at half a second each: 6 s is the start of measure 4.
    expect(scoreboard(song(), 6.1, 0.75)).toEqual({
      clock: "0:06",
      measure: { current: 4, total: 32 },
      bpm: 90
    });
  });

  it("numbers a pickup as measure 0", () => {
    expect(scoreboard(song(true), 0.2, 1).measure).toEqual({ current: 0, total: 32 });
    expect(scoreboard(song(true), 0.6, 1).measure).toEqual({ current: 1, total: 32 });
  });

  it("falls back to the clock for a song without measures or beats", () => {
    const bare: Song = {
      title: "m",
      source: "midi",
      notes: [],
      beats: [],
      measures: [],
      duration: 90
    };
    expect(scoreboard(bare, 75.9, 1)).toEqual({ clock: "1:15" });
  });
});
