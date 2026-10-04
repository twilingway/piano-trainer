import { describe, expect, it } from "vitest";
import type { Song } from "../song/song";
import { laneSong } from "./laneSong";
import type { GeneratedToken } from "./types";

const song: Song = {
  title: "t",
  source: "musicxml",
  musicXml: "<score-partwise/>",
  beats: [],
  measures: [],
  duration: 3,
  notes: [
    { id: "a", pitch: 67, start: 0, duration: 0.5, startBeat: 0, hand: "right", finger: 1 },
    { id: "b", pitch: 67, start: 0.5, duration: 1, startBeat: 1, hand: "right" },
    { id: "c", pitch: 62, start: 1.5, duration: 0.5, startBeat: 3, hand: "right" },
    { id: "d", pitch: 60, start: 2, duration: 1, startBeat: 4, hand: "right" }
  ]
};

function token(noteId: string, physicalKey: string): GeneratedToken {
  return {
    noteIndex: 0,
    noteId,
    pitch: 0,
    start: 0,
    duration: 0,
    input: { physicalKey, modifier: "none", display: "x" },
    wordIndex: 0,
    isFallback: false
  };
}

describe("laneSong", () => {
  const lane = laneSong(song, [token("a", "KeyL"), token("b", "KeyM"), token("c", "KeyL")]);

  it("gives each computer key its own column, even for one pitch on two keys", () => {
    expect([...lane.columns]).toEqual([
      ["KeyL", 36],
      ["KeyM", 37]
    ]);
    expect(lane.song.notes.map((note) => note.pitch)).toEqual([36, 37, 36]);
    expect([...lane.realPitch]).toEqual([
      ["a", 67],
      ["b", 67],
      ["c", 62]
    ]);
  });

  it("keeps the timing and takes the touch-typing finger and hand", () => {
    expect(lane.song.notes[1]).toEqual({
      id: "b",
      pitch: 37,
      start: 0.5,
      duration: 1,
      startBeat: 1,
      hand: "right",
      finger: 2
    });
    expect(lane.song.notes[0]).toMatchObject({ hand: "right", finger: 4 });
  });

  it("leaves out notes without a token and the score", () => {
    expect(lane.song.notes.map((note) => note.id)).toEqual(["a", "b", "c"]);
    expect(lane.song.musicXml).toBeUndefined();
  });
});
