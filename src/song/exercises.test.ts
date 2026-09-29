// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import type { LevelId } from "./exercises";
import { songFromMusicXml } from "./musicxml";
import { withFingering } from "./song";
import type { Song, SongNote } from "./song";

function lesson(id: string, level: LevelId): Song {
  const exercise = EXERCISES.find((item) => item.id === id);
  const found = exercise?.levels.find((item) => item.id === level);
  if (!exercise || !found) throw new Error(`missing ${id}/${level}`);
  return withFingering(songFromMusicXml(found.musicXml, exercise.title));
}

/** Left-hand notes grouped by onset, each chord sorted low to high. */
function leftChords(song: Song): number[][] {
  const byStart = new Map<number, SongNote[]>();
  for (const note of song.notes) {
    if (note.hand !== "left") continue;
    byStart.set(note.startBeat, [...(byStart.get(note.startBeat) ?? []), note]);
  }
  return [...byStart.values()].map((notes) =>
    notes.map((note) => note.pitch).sort((a, b) => a - b)
  );
}

describe("built-in lessons", () => {
  it("fingers the C major scale the way a teacher would, in both hands", () => {
    const song = lesson("scale-c", "medium");
    const fingers = (hand: "right" | "left") =>
      song.notes.filter((note) => note.hand === hand).map((note) => note.finger);
    expect(fingers("right")).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1]);
    expect(fingers("left")).toEqual([5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it("parses every level of every lesson into both hands, fingered", () => {
    for (const exercise of EXERCISES) {
      expect(exercise.levels.map((level) => level.id)).toEqual(["easy", "medium", "hard"]);
      for (const level of exercise.levels) {
        const song = lesson(exercise.id, level.id);
        expect(song.notes.some((note) => note.hand === "left")).toBe(true);
        expect(song.notes.some((note) => note.hand === "right")).toBe(true);
        expect(song.notes.every((note) => note.finger !== undefined)).toBe(true);
      }
    }
  });

  it("plays the drills in eighths on the hard level", () => {
    const quarters = lesson("five-finger-c", "medium").notes.filter(
      (note) => note.hand === "right"
    );
    const eighths = lesson("five-finger-c", "hard").notes.filter((note) => note.hand === "right");
    expect(eighths.map((note) => note.pitch)).toEqual(quarters.map((note) => note.pitch));
    expect(eighths[1]?.startBeat).toBe(0.5);
  });
});

describe("the anthem", () => {
  it("is a pickup, a verse and the chorus with its final ending", () => {
    const song = lesson("anthem-ru", "easy");
    const right = song.notes.filter((note) => note.hand === "right");
    // G4 upbeat, then "Рос-си-я — свя-щен-на-я" on C5 G4 A4 B4 E4 E4.
    expect(right.slice(0, 7).map((note) => note.pitch)).toEqual([67, 72, 67, 69, 71, 64, 64]);
    expect(right[1]?.startBeat).toBe(0.5);
    expect(right.at(-1)).toMatchObject({ pitch: 72, startBeat: 0.5 + 20 * 4 });
    // The upbeat gets no click; the first downbeat lands on "Рос-".
    expect(song.beats[0]).toMatchObject({ downbeat: true });
    expect(song.beats[0]?.time).toBeCloseTo((0.5 * 60) / 152);
  });

  it("keeps the same melody on every level", () => {
    const melody = (level: LevelId) =>
      lesson("anthem-ru", level)
        .notes.filter((note) => note.hand === "right")
        .map((note) => [note.pitch, note.startBeat]);
    expect(melody("medium")).toEqual(melody("easy"));
    expect(melody("hard")).toEqual(melody("easy"));
  });

  it("plays single roots, then the same roots in octaves", () => {
    const roots = leftChords(lesson("anthem-ru", "easy"));
    const octaves = leftChords(lesson("anthem-ru", "medium"));
    expect(roots.every((chord) => chord.length === 1)).toBe(true);
    // C3 under "Рос-", E3 under "свя-".
    expect(roots.slice(0, 2)).toEqual([[48], [52]]);
    expect(octaves).toEqual(roots.map(([root = 0]) => [root - 12, root]));
    expect(octaves.every(([low = 0, high = 0]) => high - low === 12)).toBe(true);
  });

  it("voices the chords close together, so the hand barely moves", () => {
    const chords = leftChords(lesson("anthem-ru", "hard"));
    expect(chords[0]).toEqual([48, 52, 55]);
    for (const chord of chords) {
      expect(chord).toHaveLength(3);
      expect((chord.at(-1) ?? 0) - (chord[0] ?? 0)).toBeLessThanOrEqual(9);
      expect(chord[0]).toBeGreaterThanOrEqual(43);
      expect(chord.at(-1)).toBeLessThanOrEqual(59);
    }
    chords.slice(1).forEach((chord, index) => {
      const before = chords[index] ?? chord;
      const moves = chord.map((pitch, voice) => Math.abs(pitch - (before[voice] ?? pitch)));
      expect(Math.max(...moves)).toBeLessThanOrEqual(5);
    });
  });
});
