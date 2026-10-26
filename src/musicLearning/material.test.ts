// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMusicExercise, musicFingerprint, normalizeMusicNotes } from "./material";
import { musicChoice, musicRandom } from "./random";
import type { MusicNote } from "./types";

const firstNote: MusicNote = { pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" };
const phrase: readonly MusicNote[] = [
  firstNote,
  { pitch: 62, startBeat: 1, durationBeats: 0.5, hand: "right" },
  { pitch: 64, startBeat: 1.5, durationBeats: 2.5, hand: "right" },
  { pitch: 48, startBeat: 0, durationBeats: 4, hand: "left" }
];

describe("shared music material", () => {
  it("writes and parses one authoritative score with tempo, rests and both hands", () => {
    const exercise = createMusicExercise({ id: "test", seed: 9, notes: phrase, bpm: 60 });
    expect(exercise.song.source).toBe("musicxml");
    expect(exercise.song.musicXml).toBe(exercise.musicXml);
    expect(exercise.song.notes).toHaveLength(4);
    for (const note of phrase) {
      const parsed = exercise.song.notes.find((value) => value.pitch === note.pitch);
      expect(parsed).toMatchObject({
        pitch: note.pitch,
        hand: note.hand,
        startBeat: note.startBeat,
        start: note.startBeat,
        duration: note.durationBeats
      });
      expect(parsed?.finger).toBeGreaterThanOrEqual(1);
      expect(parsed?.finger).toBeLessThanOrEqual(5);
    }
    expect(exercise.song.notes.every((note) => !("actualFinger" in note))).toBe(true);
    expect(exercise.song.duration).toBe(4);
  });

  it("preserves tied durations and synchronous chord pitches", () => {
    const notes: MusicNote[] = [60, 64, 67].map((pitch) => ({
      pitch,
      hand: "right",
      startBeat: 3,
      durationBeats: 3
    }));
    const exercise = createMusicExercise({ id: "chord", seed: 1, notes, bpm: 120 });
    expect(exercise.song.notes).toHaveLength(3);
    expect(exercise.song.notes.map((note) => [note.pitch, note.start, note.duration])).toEqual([
      [60, 1.5, 1.5],
      [64, 1.5, 1.5],
      [67, 1.5, 1.5]
    ]);
  });

  it("identifies music independently of note order, course id, title, seed and BPM", () => {
    const first = createMusicExercise({
      id: "reading",
      seed: 1,
      title: "One",
      notes: phrase,
      bpm: 60
    });
    const second = createMusicExercise({
      id: "dictation",
      seed: 2,
      title: "Two",
      notes: [...phrase].reverse(),
      bpm: 90
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(second.musicXml).not.toBe(first.musicXml);
    for (const changed of [
      phrase.map((n) => ({ ...n, pitch: n.pitch + 1 })),
      phrase.map((n) => ({ ...n, startBeat: n.startBeat + 1 })),
      phrase.map((n) => ({ ...n, durationBeats: n.durationBeats / 2 })),
      phrase.map((n) => ({
        ...n,
        hand: n.hand === "left" ? ("right" as const) : ("left" as const)
      }))
    ])
      expect(musicFingerprint(changed)).not.toBe(first.fingerprint);
  });

  it("rejects unsupported voices instead of silently changing their music", () => {
    const first = firstNote;
    expect(() => normalizeMusicNotes([first, { ...first }])).toThrow(RangeError);
    expect(() => normalizeMusicNotes([first, { ...first, pitch: 64, durationBeats: 2 }])).toThrow(
      RangeError
    );
    expect(() => normalizeMusicNotes([first, { ...first, pitch: 62, startBeat: 0.5 }])).toThrow(
      RangeError
    );
  });

  it.each([NaN, Infinity, -1, 128, 60.5])("rejects malformed MIDI pitch %s", (pitch) => {
    expect(() => musicFingerprint([{ ...firstNote, pitch }])).toThrow(RangeError);
  });

  it("rejects malformed time, tempo, seed and versions", () => {
    for (const durationBeats of [0, -1, NaN, Infinity, 1 / 3, 65])
      expect(() => normalizeMusicNotes([{ ...firstNote, durationBeats }])).toThrow(RangeError);
    for (const bpm of [0, NaN, Infinity, 241])
      expect(() => createMusicExercise({ id: "bad", seed: 1, bpm, notes: phrase })).toThrow(
        RangeError
      );
    expect(() => createMusicExercise({ id: "bad", seed: NaN, bpm: 60, notes: phrase })).toThrow(
      RangeError
    );
    expect(() =>
      createMusicExercise({ id: "bad", seed: 1, bpm: 60, notes: phrase, generatorVersion: 2 })
    ).toThrow(RangeError);
  });

  it("keeps random plans deterministic without depending on date or global random", () => {
    const a = musicRandom(42),
      b = musicRandom(42);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(() => musicRandom(NaN)).toThrow(RangeError);
    expect(() => musicChoice([], a)).toThrow(RangeError);
    expect(musicChoice([60], a)).toBe(60);
  });
});
