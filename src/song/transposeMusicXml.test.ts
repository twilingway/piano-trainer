// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { songFromMusicXml } from "./musicxml";
import { transposeMusicXml } from "./transposeMusicXml";

type Spelling = readonly [string, number];
const MAJOR_KEYS: readonly { fifths: number; shift: number; scale: readonly Spelling[] }[] = [
  {
    fifths: 0,
    shift: 0,
    scale: [
      ["C", 0],
      ["D", 0],
      ["E", 0],
      ["F", 0],
      ["G", 0],
      ["A", 0],
      ["B", 0]
    ]
  },
  {
    fifths: -5,
    shift: 1,
    scale: [
      ["D", -1],
      ["E", -1],
      ["F", 0],
      ["G", -1],
      ["A", -1],
      ["B", -1],
      ["C", 0]
    ]
  },
  {
    fifths: 2,
    shift: 2,
    scale: [
      ["D", 0],
      ["E", 0],
      ["F", 1],
      ["G", 0],
      ["A", 0],
      ["B", 0],
      ["C", 1]
    ]
  },
  {
    fifths: -3,
    shift: 3,
    scale: [
      ["E", -1],
      ["F", 0],
      ["G", 0],
      ["A", -1],
      ["B", -1],
      ["C", 0],
      ["D", 0]
    ]
  },
  {
    fifths: 4,
    shift: 4,
    scale: [
      ["E", 0],
      ["F", 1],
      ["G", 1],
      ["A", 0],
      ["B", 0],
      ["C", 1],
      ["D", 1]
    ]
  },
  {
    fifths: -1,
    shift: 5,
    scale: [
      ["F", 0],
      ["G", 0],
      ["A", 0],
      ["B", -1],
      ["C", 0],
      ["D", 0],
      ["E", 0]
    ]
  },
  {
    fifths: 6,
    shift: 6,
    scale: [
      ["F", 1],
      ["G", 1],
      ["A", 1],
      ["B", 0],
      ["C", 1],
      ["D", 1],
      ["E", 1]
    ]
  },
  {
    fifths: 1,
    shift: 7,
    scale: [
      ["G", 0],
      ["A", 0],
      ["B", 0],
      ["C", 0],
      ["D", 0],
      ["E", 0],
      ["F", 1]
    ]
  },
  {
    fifths: -4,
    shift: -4,
    scale: [
      ["A", -1],
      ["B", -1],
      ["C", 0],
      ["D", -1],
      ["E", -1],
      ["F", 0],
      ["G", 0]
    ]
  },
  {
    fifths: 3,
    shift: -3,
    scale: [
      ["A", 0],
      ["B", 0],
      ["C", 1],
      ["D", 0],
      ["E", 0],
      ["F", 1],
      ["G", 1]
    ]
  },
  {
    fifths: -2,
    shift: -2,
    scale: [
      ["B", -1],
      ["C", 0],
      ["D", 0],
      ["E", -1],
      ["F", 0],
      ["G", 0],
      ["A", 0]
    ]
  },
  {
    fifths: 5,
    shift: -1,
    scale: [
      ["B", 0],
      ["C", 1],
      ["D", 1],
      ["E", 0],
      ["F", 1],
      ["G", 1],
      ["A", 1]
    ]
  }
];

function note(step: string, alter = 0, octave = 4, staff = 1): string {
  return `<note><pitch><step>${step}</step><alter>${String(alter)}</alter><octave>${String(octave)}</octave></pitch><duration>1</duration><staff>${String(staff)}</staff></note>`;
}

function score(notes: string, fifths = 0, mode = "major"): string {
  return `<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${String(fifths)}</fifths><mode>${mode}</mode></key><staves>2</staves></attributes>${notes}</measure></part></score-partwise>`;
}

function pitches(xml: string): readonly Spelling[] {
  return Array.from(
    new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("pitch")
  ).map((pitch) => [
    pitch.querySelector("step")?.textContent ?? "",
    Number(pitch.querySelector("alter")?.textContent ?? 0)
  ]);
}

function expectInterval(before: string, after: string, shift: number): void {
  const original = songFromMusicXml(before, "before");
  const moved = songFromMusicXml(after, "after");
  expect(moved.notes.map((item) => item.pitch)).toEqual(
    original.notes.map((item) => item.pitch + shift)
  );
  expect(moved.notes.map((item) => [item.start, item.duration, item.hand])).toEqual(
    original.notes.map((item) => [item.start, item.duration, item.hand])
  );
}

describe("score transposition", () => {
  const major = score(["C", "D", "E", "F", "G", "A", "B"].map((step) => note(step)).join(""));
  const minor = score(
    note("A") + note("B") + ["C", "D", "E", "F", "G"].map((step) => note(step, 0, 5)).join(""),
    0,
    "minor"
  );

  it.each(MAJOR_KEYS)(
    "writes all seven major steps in signature $fifths",
    ({ fifths, shift, scale }) => {
      const moved = transposeMusicXml(major, shift);
      expect(moved).toContain(`<fifths>${String(fifths)}</fifths>`);
      expect(pitches(moved)).toEqual(scale);
      expectInterval(major, moved, shift);
    }
  );

  it.each(MAJOR_KEYS)(
    "writes the relative minor steps in signature $fifths",
    ({ fifths, shift, scale }) => {
      const moved = transposeMusicXml(minor, shift);
      expect(moved).toContain(`<fifths>${String(fifths)}</fifths>`);
      expect(moved).toContain("<mode>minor</mode>");
      expect(pitches(moved)).toEqual([...scale.slice(5), ...scale.slice(0, 5)]);
      expectInterval(minor, moved, shift);
    }
  );

  it("preserves a raised seventh as E sharp in F sharp harmonic minor", () => {
    const original = score(note("A") + note("G", 1, 5), 0, "minor");
    const moved = transposeMusicXml(original, -3);
    expect(pitches(moved)).toEqual([
      ["F", 1],
      ["E", 1]
    ]);
    expect(moved).toContain("<fifths>3</fifths>");
    expectInterval(original, moved, -3);
  });

  it("keeps the sounding octave when B sharp and C flat cross C", () => {
    const original = score(note("B", 1, 3) + note("C", -1, 4), 7);
    const moved = transposeMusicXml(original, -1);
    expectInterval(original, moved, -1);
    expect(pitches(moved)).toEqual([
      ["B", 0],
      ["C", -2]
    ]);
    expect(moved).toContain("<step>B</step><octave>3</octave>");
    expect(moved).toContain("<step>C</step><alter>-2</alter><octave>4</octave>");
  });

  it.each(Array.from({ length: 15 }, (_, index) => index - 7))(
    "preserves original XML for zero shift in key %i",
    (fifths) => {
      const original = score(note("C", 1), fifths);
      expect(transposeMusicXml(original, 0)).toBe(original);
    }
  );

  it("keeps numbered staff signatures separate, including after a key change", () => {
    const original = `<score-partwise><part id="P1"><measure><attributes><divisions>1</divisions><staves>2</staves><key number="1"><fifths>0</fifths></key><key number="2"><fifths>-1</fifths></key></attributes>${note("C", 0, 4, 1)}${note("F", 0, 3, 2)}</measure><measure><attributes><key number="1"><fifths>1</fifths></key></attributes>${note("F", 1, 4, 1)}${note("F", 0, 3, 2)}</measure></part></score-partwise>`;
    const moved = transposeMusicXml(original, 1);
    expect(pitches(moved)).toEqual([
      ["D", -1],
      ["F", 1],
      ["G", 0],
      ["F", 1]
    ]);
    expectInterval(original, moved, 1);
  });

  it("resets the key between parts and applies a common key to every staff", () => {
    const original = `<score-partwise><part id="P1"><measure><attributes><key><fifths>-1</fifths></key></attributes>${note("F")}</measure></part><part id="P2"><measure><attributes><key><fifths>0</fifths></key></attributes>${note("C", 0, 4, 1)}${note("F", 0, 3, 2)}</measure><measure><attributes><key><fifths>1</fifths></key></attributes>${note("F", 1, 4, 1)}${note("F", 1, 3, 2)}</measure></part></score-partwise>`;
    const moved = transposeMusicXml(original, 1);
    expect(pitches(moved)).toEqual([
      ["F", 1],
      ["D", -1],
      ["G", -1],
      ["G", 0],
      ["G", 0]
    ]);
    expectInterval(original, moved, 1);
  });

  it("creates a target signature for a score without an initial key using the inferred source", () => {
    const original = `<score-partwise><part id="P1"><measure><attributes><divisions>1</divisions></attributes>${note("C")}${note("E", -1)}</measure></part></score-partwise>`;
    const moved = transposeMusicXml(original, 2, -3);
    expect(moved).toContain("<divisions>1</divisions><key><fifths>-1</fifths></key>");
    expect(pitches(moved)).toEqual([
      ["D", 0],
      ["F", 0]
    ]);
    expectInterval(original, moved, 2);
  });

  it.each(["bad", "", "1e0", "0x1", "8", "1.5"])(
    "uses the fallback for malformed fifths %s",
    (invalid) => {
      const original = score(note("C")).replace(
        "<fifths>0</fifths>",
        `<fifths>${invalid}</fifths>`
      );
      const moved = transposeMusicXml(original, 1);
      expect(moved).toContain("<fifths>-5</fifths>");
      expect(moved).not.toContain("NaN");
      expectInterval(original, moved, 1);
    }
  );

  it("removes stale fingering and explicit accidental while retaining ties and durations", () => {
    const original = score(
      note("C").replace(
        "</note>",
        '<tie type="start"/><accidental>natural</accidental><notations><technical><fingering>3</fingering></technical></notations></note>'
      )
    );
    const moved = transposeMusicXml(original, 1);
    expect(moved).not.toContain("<fingering>");
    expect(moved).not.toContain("<accidental>");
    expect(moved).toContain('<tie type="start"');
    expectInterval(original, moved, 1);
  });
});
