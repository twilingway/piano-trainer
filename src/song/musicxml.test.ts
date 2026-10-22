// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  musicXmlWithFingering,
  musicXmlWithLineBreaks,
  musicXmlWithNoteNames,
  songFromMusicXml,
  transposeFifths,
  transposeMusicXml
} from "./musicxml";
import { withFingering } from "./song";
import { NOTE_NAME_VERSE_PREFIX, noteNameStack } from "./noteNameMarker";

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

  it("writes solved fingers back into the score it came from", () => {
    const fingered = withFingering(song);
    const annotated = songFromMusicXml(musicXmlWithFingering(SCORE, fingered.notes), "again");
    // Every sounding note now carries its solved finger as written fingering.
    expect(annotated.notes.map((note) => note.scoreFinger)).toEqual(
      fingered.notes.map((note) => note.finger)
    );
    expect(annotated.notes.map((note) => note.pitch)).toEqual(song.notes.map((note) => note.pitch));
  });

  it("breaks lines every N full measures, keeping a pickup on the first line", () => {
    const measures = (count: number, pickup: boolean) =>
      `<score-partwise><part id="P1">${Array.from(
        { length: count },
        (_, index) =>
          `<measure number="${String(index)}"${pickup && index === 0 ? ' implicit="yes"' : ""}/>`
      ).join("")}</part></score-partwise>`;
    const breaksOf = (xml: string) =>
      Array.from(
        new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("measure")
      )
        .map((measure, index) => (measure.querySelector("print[new-system='yes']") ? index : -1))
        .filter((index) => index >= 0);
    // Pickup + 9 full measures, 4 per line: new lines at full measures 5 and 9.
    expect(breaksOf(musicXmlWithLineBreaks(measures(10, true), 4))).toEqual([5, 9]);
    expect(breaksOf(musicXmlWithLineBreaks(measures(8, false), 2))).toEqual([2, 4, 6]);
  });

  it("replaces old system and page breaks without changing musical events", () => {
    const source = SCORE.replace(
      '<measure number="2">',
      '<measure number="2"><print new-system="yes" new-page="yes"><system-layout/></print>'
    );
    const regrouped = musicXmlWithLineBreaks(source, 8);
    const document = new DOMParser().parseFromString(regrouped, "application/xml");
    expect(document.querySelectorAll("print[new-system], print[new-page]")).toHaveLength(0);
    expect(document.querySelector("print > system-layout")).not.toBeNull();
    expect(songFromMusicXml(regrouped, "again").notes).toEqual(
      songFromMusicXml(source, "again").notes
    );
  });
});

describe("musicXmlWithNoteNames", () => {
  const namesOf = (xml: string) =>
    Array.from(
      new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("lyric")
    ).filter((lyric) => noteNameStack(lyric.getAttribute("number") ?? "") !== undefined);
  const wordsOf = (xml: string) =>
    namesOf(xml).map((lyric) => lyric.querySelector("text")?.textContent);

  it("names every note under it in solfège or letters, keeping the score's spelling", () => {
    const xml = `<score-partwise><part id="P1"><measure number="1">
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><chord/><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration></note>
      <note><rest/><duration>1</duration></note>
    </measure></part></score-partwise>`;
    expect(wordsOf(musicXmlWithNoteNames(xml, "ru"))).toEqual(["си♭", "до", "фа♯"]);
    expect(wordsOf(musicXmlWithNoteNames(xml, "en"))).toEqual(["B♭", "C", "F♯"]);
    const names = namesOf(musicXmlWithNoteNames(xml, "en"));
    expect(names.every((lyric) => lyric.getAttribute("placement") === "below")).toBe(true);
    expect(names.map((lyric) => noteNameStack(lyric.getAttribute("number") ?? ""))).toEqual([
      1, 1, 2
    ]);
  });

  it("preserves all note XML, original lyrics, playback timing, hands and source indices", () => {
    const xml = SCORE.replace(
      "<duration>2</duration><staff>1</staff>",
      '<duration>2</duration><staff>1</staff><lyric number="1"><text>Source words</text></lyric>'
    );
    const output = musicXmlWithNoteNames(xml, "ru");
    const noteXml = (source: string) => {
      const doc = new DOMParser().parseFromString(source, "application/xml");
      doc.querySelectorAll(`lyric[number^="${NOTE_NAME_VERSE_PREFIX}"]`).forEach((lyric) => {
        lyric.remove();
      });
      return Array.from(doc.querySelectorAll("note")).map((note) =>
        new XMLSerializer().serializeToString(note)
      );
    };
    expect(noteXml(output)).toEqual(noteXml(xml));
    const parsed = new DOMParser().parseFromString(output, "application/xml");
    expect(parsed.querySelectorAll('lyric[number="1"]')).toHaveLength(1);
    expect(parsed.querySelector("lyric > text")?.textContent).toBe("Source words");
    const before = songFromMusicXml(xml, "test");
    const after = songFromMusicXml(output, "test");
    expect(after.notes).toEqual(before.notes);
    expect(after.beats).toEqual(before.beats);
    expect(after.duration).toBe(before.duration);
  });

  it("stacks simultaneous voices per staff without changing the measure's note order", () => {
    const xml = `<score-partwise><part id="P1"><measure number="1">
      <attributes><divisions>1</divisions><staves>2</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>
      <forward><duration>1</duration></forward>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff></note>
    </measure></part></score-partwise>`;
    const output = musicXmlWithNoteNames(xml, "en");
    const names = namesOf(output);
    expect(names.map((lyric) => noteNameStack(lyric.getAttribute("number") ?? ""))).toEqual([
      1, 1, 2, 1
    ]);
    expect(wordsOf(output)).toEqual(["C", "E", "G", "F"]);
    const parsed = new DOMParser().parseFromString(output, "application/xml");
    const notes = Array.from(parsed.querySelectorAll("note"));
    expect(notes[1]?.previousElementSibling).toBe(notes[0]);
    expect(songFromMusicXml(output, "test").notes).toEqual(songFromMusicXml(xml, "test").notes);
  });

  it("emits names such as F and ми as lyrics without tempo or dynamics", () => {
    for (const [step, style, name] of [
      ["F", "en", "F"],
      ["E", "ru", "ми"]
    ] as const) {
      const xml = `<score-partwise><part id="P1"><measure><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
      const output = musicXmlWithNoteNames(xml, style);
      const parsed = new DOMParser().parseFromString(output, "application/xml");
      expect(wordsOf(output)).toEqual([name]);
      expect(parsed.querySelector("sound, dynamics, metronome")).toBeNull();
      expect(parsed.querySelector("words, direction")).toBeNull();
    }
  });
});

describe("transposeMusicXml", () => {
  const SCALE = `<score-partwise><part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><key><fifths>0</fifths></key></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>
      <notations><technical><fingering>1</fingering></technical></notations></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration></note>
    <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note>
  </measure></part></score-partwise>`;

  it("moves every pitch and the key, spelling in the new key's accidentals", () => {
    // Up a tone to D major: two sharps, F becomes G, B becomes C sharp in the next octave.
    const up = songFromMusicXml(transposeMusicXml(SCALE, 2), "up");
    expect(up.notes.map((note) => note.pitch)).toEqual([62, 67, 73]);
    expect(transposeMusicXml(SCALE, 2)).toContain("<fifths>2</fifths>");
    // Up a semitone to D flat: five flats, and the names are flats.
    const flat = transposeMusicXml(SCALE, 1);
    expect(flat).toContain("<fifths>-5</fifths>");
    const first = new DOMParser().parseFromString(flat, "application/xml").querySelector("pitch");
    expect(first?.querySelector("step")?.textContent).toBe("D");
    expect(first?.querySelector("alter")?.textContent).toBe("-1");
    expect(flat).not.toContain("<fingering>");
  });

  it("walks the circle of fifths within six accidentals", () => {
    expect(transposeFifths(0, 7)).toBe(1);
    expect(transposeFifths(0, 5)).toBe(-1);
    expect(transposeFifths(0, 6)).toBe(6);
    expect(transposeFifths(4, -4)).toBe(0);
  });
});
