// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { songFromMusicXml } from "./musicxml";
import { scorePlacements } from "./scorePlacement";
import type { Song, SongNote } from "./song";

function score(content: string): Song {
  return songFromMusicXml(
    `<score-partwise><part id="P1"><measure number="1">${content}</measure></part></score-partwise>`,
    "test"
  );
}

function note(step: string, octave = 4, alter = 0, staff = 1): string {
  return `<note><pitch><step>${step}</step><alter>${String(alter)}</alter><octave>${String(octave)}</octave></pitch><duration>1</duration><staff>${String(staff)}</staff></note>`;
}

function ordered(song: Song) {
  const placements = scorePlacements(song);
  return [...song.notes]
    .sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
    .map((value) => placements.get(value.id));
}

describe("scorePlacements", () => {
  it("preserves written enharmonic steps instead of deriving positions from MIDI pitches", () => {
    const song = score(
      `<attributes><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", 4, 1)}${note("D", 4, -1)}${note("E", 4, 1)}${note("F", 4, -1)}`
    );
    expect(song.notes.map((value) => value.pitch)).toEqual([61, 61, 65, 64]);
    expect(ordered(song)).toEqual([
      { clef: "treble", position: -2, accidental: "♯" },
      { clef: "treble", position: -1, accidental: "♭" },
      { clef: "treble", position: 0, accidental: "♯" },
      { clef: "treble", position: 1, accidental: "♭" }
    ]);
  });

  it("keeps altered and natural notes on the same step, including explicit natural marks", () => {
    const natural = note("C").replace("</note>", "<accidental>natural</accidental></note>");
    const song = score(
      `<attributes><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", 4, 1)}${natural}${note("C", 4, -1)}`
    );
    expect(ordered(song).map((value) => value?.position)).toEqual([-2, -2, -2]);
    expect(ordered(song).map((value) => value?.accidental)).toEqual(["♯", "♮", "♭"]);
  });

  it("never folds ledger notes into a nearer octave", () => {
    const song = score(`${note("C", 2)}${note("C", 4)}${note("C", 7)}`);
    // With no active clef, hand assignment selects a standard staff.
    const treble = {
      ...song,
      notes: song.notes.map((value) => ({ ...value, hand: "right" as const }))
    };
    expect(ordered(treble).map((value) => value?.position)).toEqual([-16, -2, 19]);
  });

  it("uses each active staff clef independently of the hand playing it", () => {
    const song = score(
      `<attributes><staves>2</staves><clef number="1"><sign>F</sign><line>4</line></clef><clef number="2"><sign>G</sign><line>2</line></clef></attributes>${note("G", 2, 0, 1)}${note("E", 4, 0, 2)}`
    );
    expect(song.notes.map((value) => value.hand)).toEqual(["right", "left"]);
    expect(ordered(song)).toEqual([
      { clef: "bass", position: 0, accidental: "" },
      { clef: "treble", position: 0, accidental: "" }
    ]);
  });

  it("tracks clef changes, unusual lines and octave transposition at their written locations", () => {
    const song = score(
      `<attributes><clef><sign>G</sign><line>2</line></clef></attributes>${note("E")}
      <attributes><clef><sign>G</sign><line>1</line></clef></attributes>${note("E")}
      <attributes><clef><sign>G</sign><line>2</line><clef-octave-change>1</clef-octave-change></clef></attributes>${note("E", 5)}
      <attributes><clef><sign>F</sign><line>3</line></clef></attributes>${note("G", 2)}`
    );
    expect(ordered(song)).toEqual([
      { clef: "treble", position: 0, accidental: "" },
      { clef: "treble", position: -2, accidental: "" },
      { clef: "treble", position: 0, accidental: "" },
      { clef: "bass", position: -2, accidental: "" }
    ]);
  });

  it("isolates clefs between parts and counts rests in source indices", () => {
    const song = songFromMusicXml(
      `<score-partwise><part id="P1"><measure number="1"><attributes><clef><sign>F</sign><line>4</line></clef></attributes><note><rest/><duration>1</duration></note>${note("G", 2)}</measure></part>
      <part id="P2"><measure number="1"><attributes><clef><sign>G</sign><line>2</line></clef></attributes>${note("E", 4)}</measure></part></score-partwise>`,
      "test"
    );
    expect(ordered(song)).toEqual([
      { clef: "bass", position: 0, accidental: "" },
      { clef: "treble", position: 0, accidental: "" }
    ]);
  });

  it("falls back to the hand for unsupported clefs while retaining written spelling", () => {
    const song = score(
      `<attributes><clef><sign>C</sign><line>3</line></clef></attributes>${note("D", 4, -1)}`
    );
    expect(ordered(song)).toEqual([{ clef: "treble", position: -1, accidental: "♭" }]);
  });

  it("uses canonical sharp spelling for MIDI and honors assigned hands", () => {
    const notes: SongNote[] = [
      { id: "a", pitch: 61, start: 0, duration: 1, startBeat: 0, hand: "right" },
      { id: "b", pitch: 61, start: 0, duration: 1, startBeat: 0, hand: "left" },
      { id: "c", pitch: 43, start: 0, duration: 1, startBeat: 0, hand: "left" }
    ];
    const song: Song = {
      title: "midi",
      source: "midi",
      notes,
      beats: [],
      measures: [],
      duration: 1
    };
    expect([...scorePlacements(song).values()]).toEqual([
      { clef: "treble", position: -2, accidental: "♯" },
      { clef: "bass", position: 10, accidental: "♯" },
      { clef: "bass", position: 0, accidental: "" }
    ]);
    expect([...scorePlacements({ ...song, musicXml: "<broken>" }).values()]).toEqual([
      ...scorePlacements(song).values()
    ]);
  });
});
