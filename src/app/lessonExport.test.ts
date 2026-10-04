// @vitest-environment happy-dom
import { Midi } from "@tonejs/midi";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Finger } from "../fingering/fingering";
import { withFingering } from "../song/song";
import { lessonExportFile } from "./lessonExport";
import { lessonSong } from "./lessons";
import type * as Lessons from "./lessons";

vi.mock("./lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof Lessons>();
  return { ...actual, lessonSong: vi.fn(actual.lessonSong) };
});

const EASY = { exerciseId: "anthem-ru", levelId: "easy" };

afterEach(() => {
  localStorage.clear();
});

describe("lessonExportFile", () => {
  it("names the file after the lesson and level", () => {
    expect(lessonExportFile(EASY, "musicxml").name).toBe(
      "Гимн России · Лёгкий — бас одной нотой.musicxml"
    );
    expect(lessonExportFile({ ...EASY, levelId: "hard" }, "midi").name).toBe(
      "Гимн России · Сложный — аккорды.mid"
    );
  });

  it("replaces characters a file name cannot hold", () => {
    const song = lessonSong(EASY);
    vi.mocked(lessonSong).mockReturnValueOnce({ ...song, title: 'AC/DC: "Hey?" <1|2>' });
    expect(lessonExportFile(EASY, "midi").name).toBe("AC-DC- -Hey-- -1-2-.mid");
  });

  it("writes a finger on every note, the player's correction included", () => {
    const song = lessonSong(EASY);
    const target = song.notes[0];
    const solved = withFingering(song).notes[0]?.finger ?? 1;
    const corrected = ((solved % 5) + 1) as Finger;
    localStorage.setItem(
      `fingering:${song.title}:${String(song.notes.length)}`,
      JSON.stringify([[target?.id, corrected]])
    );
    const { data } = lessonExportFile(EASY, "musicxml");
    const notes = new DOMParser()
      .parseFromString(String(data), "application/xml")
      .querySelectorAll("note");
    const pitched = Array.from(notes).filter((note) => note.querySelector("pitch"));
    expect(pitched.length).toBe(song.notes.length);
    for (const note of pitched) expect(note.querySelector("fingering")).not.toBeNull();
    const written = notes[target?.sourceIndex ?? -1]?.querySelector("fingering")?.textContent;
    expect(written).toBe(String(corrected));
  });

  it("writes every note of the level into the MIDI file", () => {
    const { data } = lessonExportFile(EASY, "midi");
    const midi = new Midi(data as Uint8Array);
    const count = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
    expect(count).toBe(lessonSong(EASY).notes.length);
  });
});
