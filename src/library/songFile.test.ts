// @vitest-environment happy-dom
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { isSongFile, songFromFileData, titleOf } from "./songFile";

const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
</measure></part></score-partwise>`;

const bytes = (text: string): ArrayBuffer => {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
};

describe("songFromFileData", () => {
  it("reads MusicXML bytes, titled after the file when the score names none", () => {
    const song = songFromFileData("Проба.musicxml", bytes(SCORE));
    expect(song.title).toBe("Проба");
    expect(song.notes.map((note) => note.pitch)).toEqual([60, 64]);
  });

  it("reads MIDI bytes, titled after the file whatever its track is named", () => {
    const midi = new Midi();
    midi.name = "Track 1";
    const track = midi.addTrack();
    track.addNote({ midi: 67, time: 0, duration: 0.5 });
    const data = midi.toArray();
    const song = songFromFileData(
      "Соль.mid",
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    );
    expect(song.title).toBe("Соль");
    expect(song.notes.map((note) => note.pitch)).toEqual([67]);
  });

  it("refuses a file that is not a song", () => {
    expect(() => songFromFileData("notes.txt", bytes("hello"))).toThrow();
  });
});

describe("file names", () => {
  it("knows song files by extension and titles them without it", () => {
    expect(["a.mid", "b.MIDI", "c.musicxml", "d.xml", "e.mxl"].every(isSongFile)).toBe(true);
    expect(isSongFile("cover.png")).toBe(false);
    expect(titleOf("My Heart Will Go On.musicxml")).toBe("My Heart Will Go On");
  });
});
