import type {
  GraphicalLyricEntry,
  GraphicalStaffEntry,
  OpenSheetMusicDisplay,
  StaffLine
} from "opensheetmusicdisplay";

import { noteNameStack } from "../song/noteNameMarker";
import { localNoteNamePositions } from "./localNoteNameLayout";

interface LyricsCalculator {
  calculateSingleStaffLineLyricsPosition(line: StaffLine, verses: string[]): GraphicalStaffEntry[];
}

const installed = new WeakSet<object>();

/** OSMD's vocal-verse baseline spans a whole system; generated note names are local. */
export function installLocalNoteNames(osmd: OpenSheetMusicDisplay): void {
  // The instance hook is intentionally limited to this OSMD 2.1 lyric-layout method.
  const calculator = osmd.GraphicSheet.GetCalculator as unknown as LyricsCalculator;
  if (installed.has(calculator)) return;
  installed.add(calculator);
  const original = calculator.calculateSingleStaffLineLyricsPosition.bind(calculator);
  calculator.calculateSingleStaffLineLyricsPosition = function (line, verses) {
    const entries = line.Measures.flatMap((measure) => measure.staffEntries);
    const marked = entries
      .map((entry) => ({
        entry,
        lyrics: entry.LyricsEntries,
        generated: entry.LyricsEntries.filter(
          (lyric) => noteNameStack(lyric.LyricsEntry.VerseNumber) !== undefined
        )
      }))
      .filter((entry) => entry.generated.length > 0);
    if (marked.length === 0) return original(line, verses);

    let sourceEntries: GraphicalStaffEntry[];
    try {
      for (const item of marked) {
        item.entry.LyricsEntries = item.lyrics.filter(
          (lyric) => noteNameStack(lyric.LyricsEntry.VerseNumber) === undefined
        );
      }
      sourceEntries = original(
        line,
        verses.filter((verse) => noteNameStack(verse) === undefined)
      );
    } finally {
      for (const item of marked) item.entry.LyricsEntries = item.lyrics;
    }

    const rules = osmd.EngravingRules;
    const sky = line.SkyBottomLineCalculator;
    // Measure every baseline before any generated label changes the bottom line.
    const groups = marked.map(({ entry, generated }) => {
      const lyrics = [...generated].sort(
        (a, b) =>
          (noteNameStack(a.LyricsEntry.VerseNumber) ?? 0) -
          (noteNameStack(b.LyricsEntry.VerseNumber) ?? 0)
      );
      const x =
        entry.PositionAndShape.RelativePosition.x +
        entry.parentMeasure.PositionAndShape.RelativePosition.x;
      const left = Math.min(...lyrics.map((lyric) => labelLeft(lyric) + x));
      const right = Math.max(...lyrics.map((lyric) => labelRight(lyric) + x));
      const baseline =
        Math.max(rules.StaffHeight, sky.getBottomLineMaxInRange(left, right)) +
        rules.LyricsYMarginToBottomLine +
        rules.LyricsYOffsetToStaffHeight;
      const positions = localNoteNamePositions(
        baseline,
        lyrics.map((lyric) => ({
          top: lyric.GraphicalLabel.PositionAndShape.BorderMarginTop,
          bottom: lyric.GraphicalLabel.PositionAndShape.BorderMarginBottom
        })),
        rules.VerticalBetweenLyricsDistance
      );
      return { lyrics, left, right, positions };
    });
    for (const group of groups) {
      let bottom = rules.StaffHeight;
      group.lyrics.forEach((lyric, index) => {
        const label = lyric.GraphicalLabel;
        const y = group.positions[index];
        if (y === undefined) return;
        const box = label.PositionAndShape;
        box.RelativePosition.y = y;
        label.Label.fontStyle = lyric.LyricsEntry.FontStyle;
        bottom = Math.max(bottom, y + box.BorderMarginBottom);
      });
      sky.updateBottomLineInRange(group.left, group.right, bottom);
    }
    const affected = new Set([...sourceEntries, ...marked.map((item) => item.entry)]);
    return entries.filter((entry) => affected.has(entry));
  };
}

function labelLeft(lyric: GraphicalLyricEntry): number {
  const box = lyric.GraphicalLabel.PositionAndShape;
  return box.RelativePosition.x + box.BorderMarginLeft;
}

function labelRight(lyric: GraphicalLyricEntry): number {
  const box = lyric.GraphicalLabel.PositionAndShape;
  return box.RelativePosition.x + box.BorderMarginRight;
}
