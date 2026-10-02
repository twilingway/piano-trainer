// @vitest-environment happy-dom
import { VexFlowGraphicalNote } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";

import { highlightUnderCursor, paintMarks } from "./staffNoteColors";

function head() {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "#ff9f43");
  group.append(path);
  return { group, path };
}

describe("staff colour priorities", () => {
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
