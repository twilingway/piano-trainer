import { describe, expect, it } from "vitest";

import type { Finger } from "../fingering/fingering";
import { withFingering } from "./song";
import type { Song, SongNote } from "./song";

const note = (id: string, pitch: number, start: number, scoreFinger?: Finger): SongNote => ({
  id,
  pitch,
  start,
  duration: 0.5,
  startBeat: start,
  hand: "right",
  ...(scoreFinger === undefined ? {} : { scoreFinger })
});

// C D E F G, the score writes finger 2 on the first C.
const SONG: Song = {
  title: "test",
  source: "musicxml",
  notes: [
    note("a", 60, 0, 2),
    note("b", 62, 1),
    note("c", 64, 2),
    note("d", 65, 3),
    note("e", 67, 4)
  ],
  measures: [],
  beats: [],
  duration: 5
};

describe("withFingering", () => {
  it("keeps a finger written in the score", () => {
    expect(withFingering(SONG).notes[0]?.finger).toBe(2);
  });

  it("lets the player's correction win over the score", () => {
    const fingered = withFingering(SONG, new Map<string, Finger>([["a", 1]]));
    expect(fingered.notes.map((item) => item.finger)).toEqual([1, 2, 3, 4, 5]);
  });
});
