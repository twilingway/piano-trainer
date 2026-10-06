// @vitest-environment happy-dom
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { songFromMidi } from "./midi";
import { signatureFifths, withWrittenScore, writtenNotes } from "./midiScore";
import { musicXmlWithFingering } from "./musicxml";
import type { Song, SongNote } from "./song";

const note = (id: string, pitch: number, startBeat: number, hand: "left" | "right"): SongNote => ({
  id,
  pitch,
  start: startBeat / 2,
  duration: 0.5,
  startBeat,
  hand
});

const SONG: Song = {
  title: "Q & A",
  source: "midi",
  notes: [note("c3", 48, 0, "left"), note("c4", 60, 0, "right"), note("e4", 64, 1, "right")],
  beats: [],
  measures: [{ start: 0, length: 4, beats: 4, beatType: 4 }],
  duration: 2
};

/** The written `<note>` elements, and the pitch each sounds. */
function written(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(document.querySelectorAll("note")).map((element) => {
    const step = element.querySelector("step")?.textContent ?? "";
    const alter = element.querySelector("alter")?.textContent ?? "";
    const type = element.querySelector("type")?.textContent ?? "";
    return { element, name: step + alter + (element.querySelector("rest") ? "rest" : ""), type };
  });
}

describe("withWrittenScore", () => {
  it("writes a two-staff score and points each note at its written head", () => {
    const ends = new Map([
      ["c3", 2],
      ["c4", 1],
      ["e4", 2]
    ]);
    const song = withWrittenScore(SONG, ends, 0);
    expect(song.musicXml).toContain("<work-title>Q &amp; A</work-title>");
    const elements = written(song.musicXml ?? "");
    for (const item of song.notes) {
      const head = elements[item.sourceIndex ?? -1];
      expect(head?.element.querySelector("octave")?.textContent).toBe(
        String(Math.floor(item.pitch / 12) - 1)
      );
      expect(head?.element.querySelector("staff")?.textContent).toBe(
        item.hand === "right" ? "1" : "2"
      );
    }
    // The notes keep the MIDI's timing: only the score is rounded.
    expect(song.notes.map((item) => item.start)).toEqual(SONG.notes.map((item) => item.start));
  });

  it("closes a hurried release but keeps a rest after a short note", () => {
    const legato = withWrittenScore(
      {
        ...SONG,
        notes: [note("a", 60, 0, "right"), note("b", 62, 1, "right"), note("c", 64, 1.75, "right")]
      },
      // A quarter let go a sixteenth early; then a staccato eighth and a sixteenth's rest.
      new Map([
        ["a", 0.75],
        ["b", 1.5],
        ["c", 2]
      ]),
      0
    );
    const right = written(legato.musicXml ?? "").filter(
      (item) => item.element.querySelector("staff")?.textContent === "1"
    );
    expect(right.slice(0, 4).map((item) => [item.name, item.type])).toEqual([
      ["C", "quarter"],
      ["D", "eighth"],
      ["rest", "16th"],
      ["E", "16th"]
    ]);
  });

  it("spells by the key signature: flats in a flat key", () => {
    const song = withWrittenScore(
      { ...SONG, notes: [note("b", 70, 0, "right")] },
      new Map([["b", 1]]),
      -2
    );
    expect(song.musicXml).toContain("<fifths>-2</fifths>");
    expect(written(song.musicXml ?? "")[0]?.name).toBe("B-1");
  });

  it("lets the score carry the solved fingers to the right heads", () => {
    const song = withWrittenScore(
      SONG,
      new Map([
        ["c3", 2],
        ["c4", 1],
        ["e4", 2]
      ]),
      0
    );
    const fingered = song.notes.map(
      (item) => ({ ...item, finger: item.pitch === 64 ? 3 : 1 }) as const
    );
    const xml = musicXmlWithFingering(song.musicXml ?? "", fingered);
    const e4 = written(xml).find((item) => item.name === "E");
    expect(e4?.element.querySelector("fingering")?.textContent).toBe("3");
  });
});

describe("signatureFifths", () => {
  it("reads the key names a MIDI reports", () => {
    expect(signatureFifths("Bb")).toBe(-2);
    expect(signatureFifths("F#")).toBe(6);
    expect(signatureFifths("C")).toBe(0);
    expect(signatureFifths("H")).toBeUndefined();
  });
});

describe("songFromMidi", () => {
  const file = (key?: string) => {
    const midi = new Midi();
    if (key) midi.header.keySignatures.push({ key, scale: "major", ticks: 0 });
    const track = midi.addTrack();
    for (const [index, pitch] of [62, 66, 69, 74].entries())
      track.addNote({ midi: pitch, ticks: index * 480, durationTicks: 480 });
    const data = midi.toArray();
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  };

  it("writes a score in the file's key signature", () => {
    const song = songFromMidi(file("D"), "D major");
    expect(song.musicXml).toContain("<fifths>2</fifths>");
    expect(song.notes.every((item) => item.sourceIndex !== undefined)).toBe(true);
  });

  it("writes it in the key the notes sound in when the file names none", () => {
    expect(songFromMidi(file(), "D major").musicXml).toContain("<fifths>2</fifths>");
  });
});

describe("writtenNotes", () => {
  // At 60 per minute a quarter is a second, so seconds and quarters read alike.
  const timed = (
    id: string,
    pitch: number,
    start: number,
    duration: number,
    hand: "left" | "right",
    part?: string
  ): SongNote => ({
    id,
    pitch,
    start,
    duration,
    startBeat: start,
    hand,
    ...(part ? { part } : {})
  });
  const slow = (notes: SongNote[]): Song => ({
    ...SONG,
    notes,
    beats: Array.from({ length: 9 }, (_, index) => ({
      time: index,
      position: index,
      downbeat: index % 4 === 0
    })),
    measures: [
      { start: 0, length: 4, beats: 4, beatType: 4 },
      { start: 4, length: 4, beats: 4, beatType: 4 }
    ],
    duration: 8,
    parts: [
      { id: "p0", role: "melody", title: "Мелодия", hand: "right" },
      { id: "p1", role: "accompaniment", title: "Аккомпанемент", hand: "right" }
    ]
  });
  const spans = (song: Song) =>
    song.notes.map((item) => [item.id, item.pitch, item.start, item.duration]);

  it("merges a doubled key into the note of the higher part", () => {
    const song = writtenNotes(
      slow([timed("acc", 72, 0, 0.5, "right", "p1"), timed("mel", 72, 0, 2, "right", "p0")])
    );
    expect(spans(song)).toEqual([["mel", 72, 0, 2]]);
    expect(song.asWritten).toBe(true);
  });

  it("cuts a held note at the hand's next start", () => {
    const song = writtenNotes(
      slow([
        timed("bass", 36, 0, 4, "left"),
        timed("e", 52, 2, 2, "left"),
        timed("g", 55, 2, 2, "left"),
        timed("top", 72, 0, 4, "right")
      ])
    );
    expect(spans(song)).toEqual([
      ["bass", 36, 0, 2],
      ["top", 72, 0, 4],
      ["e", 52, 2, 2],
      ["g", 55, 2, 2]
    ]);
  });

  it("puts starts on the grid and lets a chord last as its longest note", () => {
    const song = writtenNotes(
      slow([timed("c", 60, 1.02, 0.98, "right"), timed("e", 64, 1, 1.9, "right")])
    );
    expect(spans(song)).toEqual([
      ["c", 60, 1, 2],
      ["e", 64, 1, 2]
    ]);
    expect(song.notes.map((item) => item.startBeat)).toEqual([1, 1]);
  });

  it("keeps each note pointing at its written head", () => {
    const loaded = withWrittenScore(
      slow([timed("acc", 72, 0, 0.5, "right", "p1"), timed("mel", 72, 0, 2, "right", "p0")]),
      new Map([
        ["acc", 0.5],
        ["mel", 2]
      ]),
      0
    );
    const song = writtenNotes(loaded);
    expect(song.musicXml).toBe(loaded.musicXml);
    expect(song.notes[0]?.sourceIndex).toBe(
      loaded.notes.find((item) => item.id === "mel")?.sourceIndex
    );
  });

  it("leaves a score's notes as they are", () => {
    const score: Song = { ...SONG, source: "musicxml" };
    expect(writtenNotes(score)).toBe(score);
  });
});
