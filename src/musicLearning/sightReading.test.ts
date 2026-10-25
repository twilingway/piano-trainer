// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  assessSightGroup,
  assessSightStartingPosition,
  classifySightGroup,
  generateSightReading,
  sightReadingAhead
} from "./sightReading";
import type { SightReadingLevel } from "./sightReading";
import { sightReadingAheadXml } from "./sightReadingScore";
import { SightReadingPreview } from "./sightReadingPreview";

describe("sight reading material", () => {
  it.each<SightReadingLevel>(["notes", "steps", "triads", "two-hands"])(
    "reproduces %s with source score and finite ranges",
    (level) => {
      const a = generateSightReading({ level, seed: 42, purpose: "training" });
      const b = generateSightReading({ level, seed: 42, purpose: "training" });
      expect(a).toEqual(b);
      expect(a.groups).toHaveLength(4);
      expect(a.notes.filter((note) => note.hand === "right")).toHaveLength(16);
      expect(a.notes.every((note) => note.pitch >= 48 && note.pitch <= 67)).toBe(true);
      expect(a.song.notes.every((note) => note.finger !== undefined)).toBe(true);
      expect(a.notes.filter((note) => note.hand === "left")).toHaveLength(
        level === "two-hands" ? 4 : 0
      );
      const different = Array.from(
        { length: 16 },
        (_, seed) => generateSightReading({ level, seed, purpose: "training" }).fingerprint
      );
      expect(new Set(different).size).toBeGreaterThan(12);
    }
  );

  it("uses learned written intervals rather than semitone distances", () => {
    expect(() =>
      generateSightReading({
        level: "steps",
        seed: 1,
        purpose: "training",
        learnedIntervals: [1, 3]
      })
    ).toThrow(RangeError);
    expect(() =>
      generateSightReading({
        level: "triads",
        seed: 1,
        purpose: "training",
        learnedIntervals: [1, 2]
      })
    ).toThrow(RangeError);
    const exercise = generateSightReading({
      level: "notes",
      seed: 1,
      purpose: "training",
      learnedIntervals: [1, 2]
    });
    const range = [60, 62, 64, 65, 67];
    const notes = exercise.notes;
    notes.slice(1).forEach((note, index) => {
      const previous = notes[index];
      if (!previous) throw new Error("Missing previous sight reading note");
      expect(
        Math.abs(range.indexOf(note.pitch) - range.indexOf(previous.pitch))
      ).toBeLessThanOrEqual(1);
    });
    expect(classifySightGroup([64, 65, 67])).toBe("scalar");
    expect(classifySightGroup([60, 64, 67, 64])).toBe("triadic");
    expect(classifySightGroup([60, 60, 60])).toBe("repeated");
    expect(classifySightGroup([60, 61, 67])).toBe("mixed");
  });

  it("exposes group recognition and a chosen initial hand position without measuring fingers", () => {
    const exercise = generateSightReading({ level: "two-hands", seed: 1, purpose: "training" });
    expect(assessSightGroup(exercise, 0, "triadic")).toBe(true);
    expect(assessSightGroup(exercise, 0, "scalar")).toBe(false);
    expect(assessSightGroup(exercise, 9, "triadic")).toBe(false);
    expect(assessSightStartingPosition(exercise, "right", 60)).toMatchObject({
      suitable: true,
      position: [60, 62, 64, 65, 67]
    });
    expect(assessSightStartingPosition(exercise, "right", 62).suitable).toBe(false);
    expect(assessSightStartingPosition(exercise, "left", 48).suitable).toBe(true);
    expect(assessSightStartingPosition(exercise, "left", 49).suitable).toBe(false);
  });

  it("looks ahead by one group and changes only display XML at group boundaries", () => {
    const exercise = generateSightReading({ level: "steps", seed: 4, purpose: "training" });
    expect(sightReadingAhead(exercise, 0).map((g) => g.index)).toEqual([0, 1]);
    expect(sightReadingAhead(exercise, 4).map((g) => g.index)).toEqual([1, 2]);
    expect(sightReadingAhead(exercise, 16)).toEqual([]);
    const original = exercise.musicXml;
    const xml = sightReadingAheadXml(exercise, 0);
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const sounding = Array.from(document.querySelectorAll("note")).filter((note) =>
      note.querySelector("pitch")
    );
    expect(sounding.filter((note) => note.getAttribute("print-object") !== "no")).toHaveLength(8);
    expect(sounding.filter((note) => note.getAttribute("print-object") === "no")).toHaveLength(8);
    expect(exercise.musicXml).toBe(original);
    expect(sightReadingAheadXml(exercise, 0)).toBe(sightReadingAheadXml(exercise, 3.9));
    expect(sightReadingAheadXml(exercise, 4)).not.toBe(xml);
  });
});

describe("non-musical sight preview", () => {
  it("excludes hidden and paused time and needs manual start with released keys", () => {
    const preview = new SightReadingPreview(1000);
    expect(preview.start(2000, true)).toBe(false);
    preview.setActive(false, 4000);
    preview.step(64000);
    expect(preview.snapshot().remainingMs).toBe(7000);
    preview.setActive(true, 64000);
    preview.step(71000);
    expect(preview.snapshot()).toMatchObject({
      phase: "ready",
      canStart: true,
      scoreVisible: false
    });
    expect(preview.start(72000, false)).toBe(false);
    expect(preview.start(73000, true)).toBe(true);
    expect(preview.snapshot()).toMatchObject({ phase: "started", scoreVisible: true });
  });

  it("ignores stale timestamps and does not revive a cancelled preview", () => {
    const preview = new SightReadingPreview(1000, 5);
    preview.step(2000);
    preview.step(NaN);
    preview.step(1500);
    expect(preview.snapshot().remainingMs).toBe(4000);
    preview.cancel();
    preview.step(90000);
    expect(preview.start(90000, true)).toBe(false);
    expect(preview.snapshot()).toMatchObject({ phase: "cancelled", scoreVisible: false });
  });

  it.each([0, 4, 16, NaN, 10.5])("rejects invalid preview duration %s", (duration) => {
    expect(() => new SightReadingPreview(0, duration)).toThrow(RangeError);
  });
});
