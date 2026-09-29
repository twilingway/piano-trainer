// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { songFromMusicXml } from "./musicxml";

/*
 * Two staves, 4/4 at quarter = 60: the right hand plays C4 (finger 1), D4, then
 * an E4 half note tied into the next bar; the left hand holds a C3-G3 chord.
 */
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Проба</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><staves>2</staves></attributes>
      <direction><sound tempo="60"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff>
        <notations><technical><fingering>1</fingering></technical></notations>
      </note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff>
        <tie type="start"/>
      </note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><staff>2</staff></note>
      <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff>
        <tie type="stop"/>
      </note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
      <note><rest/><duration>4</duration><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

describe("songFromMusicXml", () => {
  const song = songFromMusicXml(SCORE, "fallback");
  const summary = song.notes.map((note) => [note.pitch, note.start, note.duration, note.hand]);

  it("reads pitches, times in seconds and hands from the staves", () => {
    expect(song.title).toBe("Проба");
    expect(summary).toEqual([
      [48, 0, 4, "left"],
      [55, 0, 4, "left"],
      [60, 0, 1, "right"],
      [62, 1, 1, "right"],
      [64, 2, 3, "right"],
      [66, 5, 1, "right"]
    ]);
  });

  it("keeps the score's fingering", () => {
    expect(song.notes.find((note) => note.pitch === 60)?.scoreFinger).toBe(1);
    expect(song.notes.find((note) => note.pitch === 62)?.scoreFinger).toBeUndefined();
  });

  it("clicks every quarter at the written tempo, ticking on each downbeat", () => {
    expect(song.beats.map((beat) => [beat.time, beat.downbeat])).toEqual([
      [0, true],
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [5, false],
      [6, false],
      [7, false]
    ]);
  });

  it("counts the second measure from the end of the first", () => {
    expect(song.notes.find((note) => note.pitch === 66)?.startBeat).toBe(5);
  });
});
