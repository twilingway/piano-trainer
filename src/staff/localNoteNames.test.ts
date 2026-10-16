import type { OpenSheetMusicDisplay, StaffLine } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";

import { NOTE_NAME_VERSE_PREFIX, noteNameStack } from "../song/noteNameMarker";
import { localNoteNamePositions } from "./localNoteNameLayout";
import { installLocalNoteNames } from "./localNoteNames";

function fixture() {
  const lyric = (verse: string) => ({
    LyricsEntry: { VerseNumber: verse, FontStyle: 0 },
    GraphicalLabel: {
      Label: { fontStyle: 0 },
      PositionAndShape: {
        RelativePosition: { x: 0, y: 4 },
        BorderMarginLeft: 0,
        BorderMarginRight: 2,
        BorderMarginTop: -2,
        BorderMarginBottom: 0.2
      }
    }
  });
  const source = lyric("1");
  const first = lyric(`${NOTE_NAME_VERSE_PREFIX}1`);
  const second = lyric(`${NOTE_NAME_VERSE_PREFIX}2`);
  const next = lyric(`${NOTE_NAME_VERSE_PREFIX}1`);
  const entry = (x: number, lyrics: ReturnType<typeof lyric>[]) => ({
    PositionAndShape: { RelativePosition: { x, y: 0 } },
    parentMeasure: { PositionAndShape: { RelativePosition: { x: 0, y: 0 } } },
    LyricsEntries: lyrics
  });
  // Adjacent names deliberately overlap in X, reproducing words' staircase trigger.
  const entries = [entry(1, [source, first, second]), entry(2, [next])];
  let bottom = 4;
  const operations: string[] = [];
  const line = {
    Measures: [{ staffEntries: entries }],
    SkyBottomLineCalculator: {
      getBottomLineMaxInRange: vi.fn(() => {
        operations.push("read");
        return bottom;
      }),
      updateBottomLineInRange: vi.fn((_left: number, _right: number, value: number) => {
        operations.push("write");
        bottom = Math.max(bottom, value);
      })
    }
  };
  const original = vi.fn((_line: StaffLine, verses: string[]) => {
    expect(entries[0]?.LyricsEntries).toEqual([source]);
    expect(entries[1]?.LyricsEntries).toEqual([]);
    expect(verses).toEqual(["1"]);
    source.GraphicalLabel.PositionAndShape.RelativePosition.y = 6;
    // Source vocals reserve their established baseline before generated names.
    bottom = 6.2;
    return entries.slice(0, 1);
  });
  const calculator = { calculateSingleStaffLineLyricsPosition: original };
  const osmd = {
    GraphicSheet: { GetCalculator: calculator },
    EngravingRules: {
      StaffHeight: 4,
      LyricsYMarginToBottomLine: 0.2,
      LyricsYOffsetToStaffHeight: 0,
      VerticalBetweenLyricsDistance: 0.5
    }
  };
  const run = () =>
    calculator.calculateSingleStaffLineLyricsPosition(line as unknown as StaffLine, [
      "1",
      `${NOTE_NAME_VERSE_PREFIX}1`,
      `${NOTE_NAME_VERSE_PREFIX}2`
    ]);
  return {
    osmd,
    calculator,
    run,
    original,
    entries,
    source,
    first,
    second,
    next,
    operations,
    line
  };
}

describe("local note-name layout", () => {
  it("stacks a chord from its own baseline using the actual label bounds", () => {
    expect(
      localNoteNamePositions(
        10,
        [
          { top: -2, bottom: 0.2 },
          { top: -3, bottom: 0.3 }
        ],
        0.5
      )
    ).toEqual([12, 15.7]);
    expect(localNoteNamePositions(4, [], 0.5)).toEqual([]);
  });

  it("recognizes only explicit positive generated-verse markers", () => {
    expect(noteNameStack(`${NOTE_NAME_VERSE_PREFIX}3`)).toBe(3);
    for (const value of [
      "1",
      "chorus",
      `${NOTE_NAME_VERSE_PREFIX}0`,
      `${NOTE_NAME_VERSE_PREFIX}1x`
    ]) {
      expect(noteNameStack(value)).toBeUndefined();
    }
  });

  it("preserves source vocals and arrays, avoiding a cascading baseline for nearby groups", () => {
    const f = fixture();
    const arrays = f.entries.map((entry) => entry.LyricsEntries);
    installLocalNoteNames(f.osmd as unknown as OpenSheetMusicDisplay);
    expect(f.run()).toEqual(f.entries);
    expect(f.entries.map((entry) => entry.LyricsEntries)).toEqual(arrays);
    expect(f.entries[0]?.LyricsEntries).toBe(arrays[0]);
    expect(f.source.GraphicalLabel.PositionAndShape.RelativePosition.y).toBe(6);
    const firstY = f.first.GraphicalLabel.PositionAndShape.RelativePosition.y;
    expect(firstY).toBeCloseTo(8.4);
    expect(f.next.GraphicalLabel.PositionAndShape.RelativePosition.y).toBeCloseTo(firstY);
    expect(f.second.GraphicalLabel.PositionAndShape.RelativePosition.y).toBeCloseTo(11.1);
    expect(f.operations).toEqual(["read", "read", "write", "write"]);
  });

  it("installs once per calculator without changing another instance", () => {
    const a = fixture();
    const b = fixture();
    installLocalNoteNames(a.osmd as unknown as OpenSheetMusicDisplay);
    const hook = a.calculator.calculateSingleStaffLineLyricsPosition;
    installLocalNoteNames(a.osmd as unknown as OpenSheetMusicDisplay);
    expect(a.calculator.calculateSingleStaffLineLyricsPosition).toBe(hook);
    expect(b.calculator.calculateSingleStaffLineLyricsPosition).toBe(b.original);
    a.run();
    expect(a.original).toHaveBeenCalledTimes(1);
  });

  it("delegates unmarked source lyrics without applying local positioning", () => {
    const f = fixture();
    if (f.entries[0]) f.entries[0].LyricsEntries = [f.source];
    if (f.entries[1]) f.entries[1].LyricsEntries = [];
    installLocalNoteNames(f.osmd as unknown as OpenSheetMusicDisplay);
    f.calculator.calculateSingleStaffLineLyricsPosition(f.line as unknown as StaffLine, ["1"]);
    expect(f.original).toHaveBeenCalledOnce();
    expect(f.operations).toEqual([]);
  });

  it("restores generated entries if the source layout fails", () => {
    const f = fixture();
    const arrays = f.entries.map((entry) => entry.LyricsEntries);
    f.original.mockImplementation(() => {
      throw new Error("engraving failed");
    });
    installLocalNoteNames(f.osmd as unknown as OpenSheetMusicDisplay);
    expect(f.run).toThrow("engraving failed");
    expect(f.entries[0]?.LyricsEntries).toBe(arrays[0]);
    expect(f.entries[1]?.LyricsEntries).toBe(arrays[1]);
  });
});
