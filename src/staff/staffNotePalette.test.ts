// @vitest-environment happy-dom
import { VexFlowGraphicalNote, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";
import {
  paintStaffNotes,
  setStaffColors,
  paintMarks,
  highlightUnderCursor
} from "./staffNoteColors";
const NS = "http://www.w3.org/2000/svg";
describe("exact palette noteheads", () => {
  function chord() {
    const heads = Array.from({ length: 3 }, () => {
      const g = document.createElementNS(NS, "g");
      g.append(document.createElementNS(NS, "path"));
      return g;
    });
    const paints = [vi.fn(), vi.fn(), vi.fn()];
    const colors = ["#ff7b80", "#bfdc59", "#70bcef"];
    const notes = colors.map((color, index) => {
      const note = Object.create(VexFlowGraphicalNote.prototype) as VexFlowGraphicalNote;
      Object.defineProperties(note, {
        vfnoteIndex: { value: index },
        sourceNote: { value: { NoteheadColorXml: color, ParentVoiceEntry: {} } }
      });
      note.getNoteheadSVGs = () => heads as unknown as HTMLElement[];
      note.setColor = paints[index] ?? vi.fn();
      return note;
    });
    const osmd = {
      setOptions: vi.fn(),
      GraphicSheet: { MeasureList: [[{ staffEntries: [{ graphicalVoiceEntries: [{ notes }] }] }]] },
      cursor: { GNotesUnderCursor: () => notes }
    } as unknown as OpenSheetMusicDisplay;
    return { heads, notes, osmd, colors, paints };
  }
  it("paints a C major chord with three independent colours and preserves highlight priorities", () => {
    const { heads, notes, osmd, colors, paints } = chord();
    setStaffColors(osmd, "#ffffff", "#eeeeee", true);
    paintStaffNotes(osmd, "#ffffff", true);
    expect(notes.map((n) => n.sourceNote.NoteheadColor)).toEqual(colors);
    expect(heads.map((h) => h.querySelector("path")?.getAttribute("fill"))).toEqual(colors);
    for (const paint of paints)
      expect(paint).toHaveBeenCalledWith(
        "#ffffff",
        expect.objectContaining({ applyToNoteheads: false })
      );
    const first = heads[0];
    const path = first?.querySelector("path");
    if (!first || !path) throw new Error("Missing head");
    const shapes = [first, path];
    paintMarks(new Map([["0:60", shapes]]), new Map([["0:60", "#abcdef"]]));
    expect(shapes[1]?.style.fill).toBe("#abcdef");
    paintMarks(new Map([["0:60", shapes]]), undefined);
    expect(shapes[1]?.getAttribute("fill")).toBe(colors[0]);
    const painted = highlightUnderCursor(osmd, [], "#00df50");
    expect(heads[0]?.querySelector("path")?.style.fill).toBe("#00df50");
    osmd.cursor.GNotesUnderCursor = () => [];
    highlightUnderCursor(osmd, painted);
    expect(heads[0]?.querySelector("path")?.getAttribute("fill")).toBe(colors[0]);
  });
  it("keeps classic/control colours uniform when palette was not explicitly permitted", () => {
    const { notes, osmd, paints } = chord();
    setStaffColors(osmd, "#aabbcc", "#eeeeee");
    paintStaffNotes(osmd, "#aabbcc");
    expect(notes.map((n) => n.sourceNote.NoteheadColor)).toEqual(["#aabbcc", "#aabbcc", "#aabbcc"]);
    for (const paint of paints)
      expect(paint).toHaveBeenCalledWith(
        "#aabbcc",
        expect.objectContaining({ applyToNoteheads: true })
      );
  });
});
