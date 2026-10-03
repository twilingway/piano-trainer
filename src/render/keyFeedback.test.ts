import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { keyHintNote } from "./keyFeedback";

const bass: SongNote = {
  id: "bass",
  pitch: 36,
  hand: "left",
  finger: 5,
  start: 0,
  startBeat: 0,
  duration: 4
};

describe("keyHintNote", () => {
  it("clears a played bass hint after release even before its written duration ends", () => {
    expect(keyHintNote(undefined, bass, false)).toBeUndefined();
  });
  it("retains the finger of a physically held or automatically sounding bass", () => {
    expect(keyHintNote(undefined, bass, true)).toBe(bass);
  });
  it("retains an unplayed awaited note without requiring the key to be held", () => {
    expect(keyHintNote(bass, undefined, false)).toBe(bass);
  });
  it("prefers the next owed fingering over an earlier note of the same pitch", () => {
    const repeated = { ...bass, id: "repeat", start: 4, finger: 1 as const };
    expect(keyHintNote(repeated, bass, true)).toBe(repeated);
  });
});
