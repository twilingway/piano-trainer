// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { EXERCISES } from "./exercises";
import { detectChords, detectKey, keyName, musicXmlWithChords } from "./harmony";
import type { Chord } from "./harmony";
import { songFromMusicXml } from "./musicxml";

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
