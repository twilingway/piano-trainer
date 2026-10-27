import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { sharedTabLabelWidths } from "./sharedReaderSpacing";

const notes: readonly SongNote[] = [
  { id: "bass", pitch: 48, hand: "left", start: 0, startBeat: 0, duration: 4 },
  { id: "g", pitch: 67, hand: "right", start: 0, startBeat: 0, duration: 0.25 },
  { id: "sharp", pitch: 68, hand: "right", start: 0.25, startBeat: 0.25, duration: 0.25 }
];

describe("shared reader label spacing", () => {
  it("reserves actual monospace widths at attacks without creating labels in silent beats", () => {
    const widths = sharedTabLabelWidths({ notes, noteNames: "ru", zoom: 1 });
    expect(widths.get(0)).toBeCloseTo(4 * 0.6 * 26 + 4);
    expect(widths.get(0.25)).toBeCloseTo(5 * 0.6 * 26 + 4);
    expect([...widths.keys()]).toEqual([0, 0.25]);
    expect(sharedTabLabelWidths(undefined).size).toBe(0);
  });
  it("combines the independent tab preference and responsive font scale", () => {
    const widths = sharedTabLabelWidths({ notes, noteNames: "ru", zoom: 2 }, 0.65);
    expect(widths.get(0.25)).toBeCloseTo(5 * 0.6 * 26 * 2 * 0.65 + 4);
    for (const noteNames of ["en", "off"] as const) {
      expect(sharedTabLabelWidths({ notes, noteNames, zoom: 1.5 }).get(0.25)).toBeCloseTo(
        2 * 0.6 * 26 * 1.5 + 4
      );
    }
  });
});
