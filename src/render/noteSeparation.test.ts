import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { repeatedNoteEnds, repeatGap } from "./noteSeparation";

const note = (id: string, start: number, pitch = 60): SongNote => ({
  id,
  start,
  pitch,
  startBeat: start * 2,
  duration: 1,
  hand: "right"
});

describe("repeated note separation", () => {
  it("marks touching notes on the same key, including repetitions across fingers", () => {
    expect([...repeatedNoteEnds([note("a", 0), note("b", 1), note("c", 2)])]).toEqual(["a", "b"]);
  });
  it("leaves different keys and existing rests unchanged", () => {
    expect([...repeatedNoteEnds([note("a", 0), note("b", 1, 62), note("c", 3)])]).toEqual([]);
  });
  it("compensates for perspective compression", () => {
    expect(repeatGap(200, 44)).toBe(11);
    expect(repeatGap(200, 44, 0.2)).toBe(50);
  });
  it("keeps at least three quarters of a short block visible", () => {
    expect(repeatGap(4, 44, 0.01)).toBe(1);
    expect(repeatGap(0, 44)).toBe(0);
  });
});
