// @vitest-environment happy-dom
import { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";
import { CLAY_NOTES, musicXmlWithClayColors } from "../song/clayNotes";
import { findSongCourseNode, findSongCourseSource } from "../songCourse/catalog";
import { feedbackNotehead } from "../staff/staffExactNotehead";
import { highlightUnderCursor, paintStaffNotes, setStaffColors } from "../staff/staffNoteColors";
import { songCourseMiniatureXml } from "./songCourseMiniatureXml";
import { songCourseMiniatureColor } from "./songCourseMiniatureColor";

describe("miniature source palette in installed OSMD", () => {
  it.each([
    ["hot-cross-buns", "notes-c", "C"],
    ["hot-cross-buns", "notes-d", "D"],
    ["hot-cross-buns", "notes-e-intro", "E"],
    ["joy-octave", "eighth", "A"]
  ] as const)(
    "retains %s/%s head, stem and flag colour through live-highlight painting",
    async (songId, suffix, step) => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () =>
          ({
            measureText: (text: string) => ({ width: text.length * 7 })
          }) as unknown as GPUCanvasContext
      );
      const source = findSongCourseSource(songId);
      const node = findSongCourseNode(songId, `${songId}/${suffix}`);
      if (!source || !node) throw new Error("missing source node");
      const xml = songCourseMiniatureXml(source, node);
      const color = songCourseMiniatureColor(xml);
      expect(color).toBe(CLAY_NOTES[step].color);
      const host = document.body.appendChild(document.createElement("div"));
      Object.defineProperty(host, "offsetWidth", { value: 300 });
      const osmd = new OpenSheetMusicDisplay(host, {
        backend: "svg",
        autoResize: false,
        renderSingleHorizontalStaffline: true
      });
      try {
        await osmd.load(musicXmlWithClayColors(xml));
        setStaffColors(osmd, color, "#99b9c7", true);
        osmd.render();
        paintStaffNotes(osmd, color, true);
        const notes = osmd.GraphicSheet.MeasureList.flatMap((row) =>
          row.flatMap((measure) =>
            measure.staffEntries.flatMap((entry) =>
              entry.graphicalVoiceEntries.flatMap((voice) => voice.notes)
            )
          )
        );
        const note = notes.find(
          (value): value is VexFlowGraphicalNote =>
            value instanceof VexFlowGraphicalNote && !value.sourceNote.isRest()
        );
        if (!note) throw new Error("missing rendered note");
        const head = feedbackNotehead(note);
        expect(head?.getAttribute("fill")).toBe(color);
        expect(note.getStemSVG().outerHTML).toContain(color);
        if (suffix === "eighth") expect(note.getFlagSVG().outerHTML).toContain(color);
        const paths = [...host.querySelectorAll("path")].map((path) => path.getAttribute("d"));
        osmd.cursor.reset();
        highlightUnderCursor(osmd, [], color);
        expect(head?.style.fill).toBe(color);
        expect(note.getStemSVG().outerHTML).toContain(color);
        expect([...host.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual(
          paths
        );
      } finally {
        osmd.clear();
        host.remove();
        vi.restoreAllMocks();
      }
    }
  );
});
