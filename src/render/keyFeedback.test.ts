import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { keyHintNote, keyHintStrength, strongestKeyHint } from "./keyFeedback";

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

describe("keyHintStrength", () => {
  const note = { ...bass, start: 1 };

  it("starts from zero at 300 ms and brightens as the note approaches", () => {
    expect(keyHintStrength(note, 0, 1)).toBe(0);
    expect(keyHintStrength(note, 0.7, 1)).toBe(0);
    expect(keyHintStrength(note, 0.85, 1)).toBeCloseTo(0.375);
    expect(keyHintStrength(note, 0.999, 1)).toBeGreaterThan(0.74);
  });

  it("uses the same 300 real ms at half speed", () => {
    expect(keyHintStrength(note, 0.85, 0.5)).toBe(0);
    expect(keyHintStrength(note, 0.925, 0.5)).toBeCloseTo(0.375);
    expect(keyHintStrength(note, 1, 0.5)).toBe(1);
  });

  it("flashes for 80 real ms and retains a steady cue for an overdue pending note", () => {
    expect(keyHintStrength(note, 1, 1)).toBe(1);
    expect(keyHintStrength(note, 1.04, 1)).toBeCloseTo(0.875);
    expect(keyHintStrength(note, 1.08, 1)).toBe(0.75);
    expect(keyHintStrength(note, 1.2, 1)).toBe(0.75);
    expect(keyHintStrength(note, 1.04, 0.5)).toBe(0.75);
    expect(keyHintStrength(undefined, 1.2, 1)).toBe(0);
  });

  it("hides the cue in performance mode and holds it steady on a frozen wait clock", () => {
    expect(keyHintStrength(note, 0.9, 1, false)).toBe(0);
    expect(keyHintStrength(note, 1, 1, false)).toBe(0);
    expect(keyHintStrength(note, 1, 1, true, true)).toBe(0.75);
  });
});

describe("strongestKeyHint", () => {
  it("flashes a repeated physical key even while its earlier note still awaits judgment", () => {
    const old = { ...bass, start: 0.8 };
    const arriving = { ...bass, id: "repeat", start: 1 };
    const pending = [old, arriving];
    expect(strongestKeyHint(pending, bass.pitch, 0.9, 1)).toBe(old);
    expect(strongestKeyHint(pending, bass.pitch, 1, 1)).toBe(arriving);
    expect(strongestKeyHint(pending, bass.pitch, 1.04, 1)).toBe(arriving);
    expect(strongestKeyHint(pending, bass.pitch, 1.09, 1)).toBe(old);
    expect(strongestKeyHint(pending, bass.pitch, 1, 1, false)).toBeUndefined();
  });
});
