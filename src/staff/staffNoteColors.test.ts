// @vitest-environment happy-dom
import { VexFlowGraphicalNote } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";

import { highlightUnderCursor, paintMarks, paintStaffFingerings } from "./staffNoteColors";

function head() {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "#ff9f43");
  group.append(path);
  return { group, path };
}

describe("staff colour priorities", () => {
  it("paints only fingering labels using the shared finger palette or score colour", () => {
    const makeLabel = (digit: string) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = digit;
      group.append(text);
      return { SVGNode: group, Label: { text: digit } };
    };
    const labels = [makeLabel("1"), makeLabel("5"), makeLabel("1–2")];
    const lyric = makeLabel("5");
    const osmd = {
      GraphicSheet: {
        MeasureList: [[{ staffEntries: [{ FingeringEntries: labels, LyricsEntries: [lyric] }] }]]
      }
    } as unknown as OpenSheetMusicDisplay;
    paintStaffFingerings(osmd, "fingers", "#ffffff");
    expect(labels.map((label) => label.SVGNode.style.fill)).toEqual([
      "#f5952e",
      "#9b5cf0",
      "#ffffff"
    ]);
    expect(lyric.SVGNode.style.fill).toBe("");
    expect(labels[0]?.SVGNode.querySelector("text")?.style.fill).toBe("#f5952e");
    paintStaffFingerings(osmd, "mono", "#a0ffcc");
    expect(labels.map((label) => label.SVGNode.style.fill)).toEqual([
      "#a0ffcc",
      "#a0ffcc",
      "#a0ffcc"
    ]);
  });
  it("restores the user note colour after clearing a review mark", () => {
    const { path } = head();
    const heads = new Map([["0:60", [path]]]);
    paintMarks(heads, new Map([["0:60", "#69d88b"]]));
    expect(path.style.fill).toBe("#69d88b");
    paintMarks(heads, undefined);
    expect(path.style.fill).toBe("");
    expect(path.getAttribute("fill")).toBe("#ff9f43");
  });

  it("temporarily highlights the current note and then restores its review mark", () => {
    const { group, path } = head();
    const note = Object.create(VexFlowGraphicalNote.prototype) as VexFlowGraphicalNote;
    // OSMD types the SVG backend's notehead groups as HTML elements.
    note.getNoteheadSVGs = () => [group as unknown as HTMLElement];
    const osmd = {
      cursor: { GNotesUnderCursor: () => [note] }
    } as unknown as OpenSheetMusicDisplay;
    paintMarks(new Map([["0:60", [group, path]]]), new Map([["0:60", "#69d88b"]]));
    const painted = highlightUnderCursor(osmd, []);
    expect(path.style.fill).toBe("#e63946");
    osmd.cursor.GNotesUnderCursor = () => [];
    highlightUnderCursor(osmd, painted);
    expect(path.style.fill).toBe("#69d88b");
  });
});
