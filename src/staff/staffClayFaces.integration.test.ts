// @vitest-environment happy-dom
import {
  Fraction,
  Notehead,
  OpenSheetMusicDisplay,
  VexFlowGraphicalNote
} from "opensheetmusicdisplay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyStaffClayFaces, hasClayFace } from "./staffClayFaces";
import { applyStaffClayMaterial } from "./staffClayMaterial";
import { feedbackNotehead } from "./staffExactNotehead";
import { highlightUnderCursor, paintMarks, paintStaffNotes } from "./staffNoteColors";

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected fixture value");
  return value;
}
const note = (step: string, type: string, extra = "", stem = "up") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>${type}</type>${extra}<stem>${stem}</stem></note>`;
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", "quarter")}${note("D", "eighth", "<dot/>", "down")}${note("E", "half", "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>")}${note("F", "whole")}</measure></part></score-partwise>`;
let host: HTMLDivElement;
let osmd: OpenSheetMusicDisplay;
let notes: VexFlowGraphicalNote[];

beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ measureText: (s: string) => ({ width: s.length * 7 }) }) as unknown as GPUCanvasContext
  );
  host = document.body.appendChild(document.createElement("div"));
  Object.defineProperty(host, "offsetWidth", { value: 1000 });
  osmd = new OpenSheetMusicDisplay(host, { backend: "svg", autoResize: false });
  await osmd.load(xml);
  osmd.render();
  notes = osmd.GraphicSheet.MeasureList.flatMap((row) =>
    row.flatMap((m) =>
      m.staffEntries.flatMap((e) => e.graphicalVoiceEntries.flatMap((v) => v.notes))
    )
  ).filter((n): n is VexFlowGraphicalNote => n instanceof VexFlowGraphicalNote);
  for (const n of notes) {
    const head = feedbackNotehead(n);
    if (head)
      Object.defineProperty(head, "getBBox", {
        configurable: true,
        value: () => new DOMRect(100, 120, 13, 10)
      });
  }
});
afterEach(() => {
  osmd.clear();
  host.remove();
  vi.restoreAllMocks();
});

describe("cheerful clay heads in installed OSMD", () => {
  it("uses written type for dotted/tuplet notes and retains hollow and custom heads", () => {
    expect(notes.map(hasClayFace)).toEqual([true, true, false, false]);
    const filled = notes[0];
    const hollow = notes[2];
    expect(filled).toBeDefined();
    expect(hollow).toBeDefined();
    if (!filled || !hollow) throw new Error("Expected source notes");
    hollow.sourceNote.Length = new Fraction(1, 8);
    filled.sourceNote.Length = new Fraction(1, 1);
    expect(hasClayFace(hollow)).toBe(false);
    expect(hasClayFace(filled)).toBe(true);
    filled.sourceNote.Notehead = new Notehead(filled.sourceNote, "diamond", true);
    expect(hasClayFace(filled)).toBe(false);
    filled.sourceNote.Notehead = new Notehead(filled.sourceNote, "normal", false);
    expect(hasClayFace(filled)).toBe(false);
    filled.sourceNote.Notehead = new Notehead(filled.sourceNote, "normal", true);
    filled.sourceNote.CustomNoteheadVFCode = "vb";
    expect(hasClayFace(filled)).toBe(false);
  });

  it("draws identical upright expressions inside each filled head, preserving musical paths", () => {
    const paths = [...host.querySelectorAll("path")].map((p) => p.getAttribute("d"));
    applyStaffClayMaterial(host, true, osmd);
    const faces = [...host.querySelectorAll("[data-clay-face]")];
    expect(faces).toHaveLength(2);
    expect(faces[0]?.outerHTML).toEqual(faces[1]?.outerHTML);
    expect(faces.every((face) => face.getAttribute("pointer-events") === "none")).toBe(true);
    expect(faces.every((face) => face.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(faces.every((face) => face.querySelector("path") === null)).toBe(true);
    expect([...host.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(paths);
    expect(feedbackNotehead(required(notes[2]))?.querySelector("[data-clay-face]")).toBeNull();
    expect(feedbackNotehead(required(notes[3]))?.querySelector("[data-clay-face]")).toBeNull();
  });

  it("retains face paint through hint, accepted-note colour and restoration", () => {
    applyStaffClayFaces(host, true, osmd);
    const face = host.querySelector("[data-clay-face]");
    expect(face).not.toBeNull();
    const original = face?.outerHTML;
    const head = feedbackNotehead(required(notes[0]));
    if (!head) throw new Error("Expected actual head");
    required(notes[0]).sourceNote.NoteheadColorXml = "#ff7b80";
    paintStaffNotes(osmd, "#ffffff", true);
    const shapes = [head, ...head.querySelectorAll<SVGElement>("path")];
    const heads = new Map([["note", shapes]]);
    paintMarks(heads, new Map([["note", "#42ed72"]]));
    const painted = highlightUnderCursor(osmd, [], "#00df50");
    highlightUnderCursor(osmd, painted, "#00df50");
    paintMarks(heads, undefined);
    expect(face?.outerHTML).toBe(original);
    expect(face?.querySelector("ellipse")?.getAttribute("fill")).toBe("#65323d");
  });

  it("does not duplicate on repeated passes and restores the original on disable", () => {
    const source = host.innerHTML;
    applyStaffClayFaces(host, true, osmd);
    applyStaffClayFaces(host, true, osmd);
    expect(host.querySelectorAll("[data-clay-face]")).toHaveLength(2);
    applyStaffClayFaces(host, false, osmd);
    expect(host.innerHTML).toBe(source);
  });
  it("decorates the exact three adjacent chord heads rather than repeating the first head", async () => {
    const chord = ["C", "D", "E"]
      .map(
        (step, index) =>
          `<note>${index > 0 ? "<chord/>" : ""}<pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><stem>down</stem></note>`
      )
      .join("");
    const chordXml =
      xml.slice(0, xml.indexOf("<note>")) + chord + xml.slice(xml.lastIndexOf("</measure>"));
    await osmd.load(chordXml);
    osmd.render();
    const chordNotes = osmd.GraphicSheet.MeasureList.flatMap((row) =>
      row.flatMap((m) =>
        m.staffEntries.flatMap((e) => e.graphicalVoiceEntries.flatMap((v) => v.notes))
      )
    ).filter((n): n is VexFlowGraphicalNote => n instanceof VexFlowGraphicalNote);
    expect(chordNotes).toHaveLength(3);
    const heads = chordNotes.map((n) => required(feedbackNotehead(n)));
    for (const [index, head] of heads.entries())
      Object.defineProperty(head, "getBBox", {
        configurable: true,
        value: () => new DOMRect(100 + index * 13, 100 - index * 5, 13, 10)
      });
    applyStaffClayFaces(host, true, osmd);
    expect(host.querySelectorAll("[data-clay-face]")).toHaveLength(3);
    expect(new Set(heads).size).toBe(3);
    for (const head of heads) {
      const face = required(head.querySelector("[data-clay-face]"));
      expect(face.getAttribute("transform")).not.toContain("rotate");
      expect(head.querySelectorAll("[data-clay-face]")).toHaveLength(1);
    }
  });
});
