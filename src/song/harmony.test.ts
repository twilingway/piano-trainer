// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import { detectChords, detectKey, keyName, musicXmlWithChords } from "./harmony";
import type { Chord } from "./harmony";
import { songFromMusicXml } from "./musicxml";
import type { Song } from "./song";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SUFFIX: Readonly<Record<Chord["kind"], string>> = {
  major: "",
  minor: "m",
  diminished: "dim",
  augmented: "aug",
  dominant: "7",
  "minor-seventh": "m7",
  "major-seventh": "maj7"
};

function lesson(id: string, level: "easy" | "medium" | "hard") {
  const exercise = EXERCISES.find((item) => item.id === id);
  const found = exercise?.levels.find((item) => item.id === level);
  if (!found) throw new Error(`missing ${id}`);
  return songFromMusicXml(found.musicXml, id);
}

describe("detectChords", () => {
  it("names the anthem's harmony from its chords and melody", () => {
    const chords = detectChords(lesson("anthem-ru", "hard")).map(
      (chord) => `${String(chord.beat)}:${NAMES[chord.root] ?? ""}${SUFFIX[chord.kind]}`
    );
    // The arrangement: C Em | F C | Dm F | D G7 over the first four measures after the upbeat.
    expect(chords.slice(0, 9)).toEqual([
      "0.5:C",
      "2.5:Em",
      "4.5:F",
      "6.5:C",
      "8.5:Dm",
      "10.5:F",
      "12.5:D",
      "14.5:G7",
      "16.5:C"
    ]);
  });
});

describe("detectKey", () => {
  it("hears C major in the anthem and the C drills", () => {
    const anthem = detectKey(lesson("anthem-ru", "hard"));
    expect(anthem && keyName(anthem)).toBe("До мажор");
    const scale = detectKey(lesson("scale-c", "easy"));
    expect(scale && keyName(scale)).toBe("До мажор");
  });

  function fixture(
    key: string,
    pitches = [60, 64, 67, 60],
    source: Song["source"] = "musicxml"
  ): Song {
    return {
      title: "Test key",
      source,
      notes: pitches.map((pitch, index) => ({
        id: String(index),
        pitch,
        start: index,
        duration: 1,
        startBeat: index,
        hand: "right"
      })),
      beats: [],
      measures: [],
      duration: pitches.length,
      musicXml: `<score-partwise><part id="P1"><measure number="1"><attributes>${key}</attributes></measure></part></score-partwise>`
    };
  }

  it("reads all 15 authored major and minor keys even against unrelated notes", () => {
    for (let fifths = -7; fifths <= 7; fifths++) {
      for (const mode of ["major", "minor"] as const) {
        const xmlKey = `<key><fifths>${String(fifths)}</fifths><mode>${mode}</mode></key>`;
        const song = fixture(xmlKey);
        const original = song.musicXml;
        expect(detectKey(song)).toEqual({
          tonic: (((fifths * 7 + (mode === "minor" ? 9 : 0)) % 12) + 12) % 12,
          mode,
          fifths
        });
        expect(song.musicXml).toBe(original);
      }
    }
  });

  it("uses an explicit authored mode even with no sounding notes", () => {
    expect(detectKey(fixture("<key><fifths>7</fifths><mode>major</mode></key>", []))).toEqual({
      tonic: 1,
      mode: "major",
      fifths: 7
    });
    expect(detectKey(fixture("<key><fifths>-7</fifths><mode>minor</mode></key>", []))).toEqual({
      tonic: 8,
      mode: "minor",
      fifths: -7
    });
  });

  it("limits an absent mode to the signature's relative pair", () => {
    const cKey = "<key><fifths>0</fifths></key>";
    expect(detectKey(fixture(cKey))).toEqual({ tonic: 0, mode: "major", fifths: 0 });
    expect(detectKey(fixture(cKey, [69, 72, 76, 69]))).toEqual({
      tonic: 9,
      mode: "minor",
      fifths: 0
    });
    for (let fifths = -7; fifths <= 7; fifths++) {
      // These pitch classes strongly suggest E minor, even for unrelated signatures.
      const key = detectKey(
        fixture(`<key><fifths>${String(fifths)}</fifths></key>`, [64, 67, 71, 64])
      );
      expect(key?.fifths).toBe(fifths);
      const major = (((fifths * 7) % 12) + 12) % 12;
      expect([major, (major + 9) % 12]).toContain(key?.tonic);
    }
  });

  it.each(["", "bad", "2.5", "8", "-8", "1e0", "0x1"])(
    "falls back to pitch profiles for invalid fifths %s",
    (fifths) => {
      expect(detectKey(fixture(`<key><fifths>${fifths}</fifths><mode>minor</mode></key>`))).toEqual(
        { tonic: 0, mode: "major" }
      );
    }
  );

  it("takes the first valid authored key and ignores later modulation", () => {
    expect(
      detectKey(
        fixture(
          "<key><fifths>bad</fifths></key><key><fifths>-6</fifths><mode>major</mode></key><key><fifths>0</fifths><mode>major</mode></key>"
        )
      )
    ).toEqual({ tonic: 6, mode: "major", fifths: -6 });
  });

  it("does not invent a major/minor key for an explicit unsupported mode", () => {
    expect(detectKey(fixture("<key><fifths>0</fifths><mode>dorian</mode></key>"))).toBeUndefined();
  });

  it("does not treat a nontraditional key as an authored traditional signature", () => {
    expect(
      detectKey(
        fixture("<key><fifths>1</fifths><key-step>F</key-step><key-alter>1</key-alter></key>")
      )
    ).toEqual({ tonic: 0, mode: "major" });
  });

  it("retains inference without a key and for MIDI, and no key for empty MIDI", () => {
    expect(detectKey(fixture(""))).toEqual({ tonic: 0, mode: "major" });
    expect(
      detectKey(fixture("<key><fifths>7</fifths><mode>minor</mode></key>", undefined, "midi"))
    ).toEqual({ tonic: 0, mode: "major" });
    expect(detectKey(fixture("", [], "midi"))).toBeUndefined();
  });
});

describe("musicXmlWithChords", () => {
  it("puts each chord symbol before the first note of its stretch", () => {
    const xml = EXERCISES.find((item) => item.id === "anthem-ru")?.levels[2]?.musicXml ?? "";
    const song = songFromMusicXml(xml, "anthem");
    const written = musicXmlWithChords(xml, detectChords(song));
    const document = new DOMParser().parseFromString(written, "application/xml");
    const symbols = Array.from(document.querySelectorAll("harmony"))
      .slice(0, 4)
      .map(
        (harmony) =>
          `${harmony.querySelector("root-step")?.textContent ?? ""}:${harmony.querySelector("kind")?.textContent ?? ""}`
      );
    expect(symbols).toEqual(["C:major", "E:minor", "F:major", "C:major"]);
    // The notes themselves are untouched: the score reads back the same.
    expect(songFromMusicXml(written, "again").notes.length).toBe(song.notes.length);
  });
});
