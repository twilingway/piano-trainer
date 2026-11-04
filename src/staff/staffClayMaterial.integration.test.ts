// @vitest-environment happy-dom
import { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";
import { musicXmlWithClayColors, CLAY_NOTES } from "../song/clayNotes";
import { setStaffColors, paintStaffNotes } from "./staffNoteColors";
import { feedbackNotehead } from "./staffExactNotehead";
import { applyStaffClayMaterial } from "./staffClayMaterial";
const n = (
  step: string,
  octave: number,
  duration: number,
  type: string,
  staff: number,
  extra = "",
  stem = "up"
) =>
  `<note>${extra}<pitch><step>${step}</step><octave>${String(octave)}</octave></pitch><duration>${String(duration)}</duration><voice>${String(staff)}</voice><type>${type}</type><stem>${stem}</stem><staff>${String(staff)}</staff></note>`;
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>${n("C", 4, 2, "half", 1)}${n("E", 4, 2, "half", 1, "<chord/>")}${n("G", 4, 2, "half", 1, "<chord/>")}${n("B", 4, 1, "quarter", 1, "", "down")}${n("A", 4, 1, "quarter", 1)}<backup><duration>4</duration></backup>${n("C", 3, 4, "whole", 2, "", "down")}</measure><measure number="2">${n("D", 5, 4, "whole", 1, "", "down")}<backup><duration>4</duration></backup>${n("D", 3, 4, "whole", 2, "", "down")}</measure></part></score-partwise>`;
describe("clay material in installed OSMD", () => {
  it("retains the actual hollow/stem glyphs and colours three chord heads independently", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({ measureText: (s: string) => ({ width: s.length * 7 }) }) as unknown as GPUCanvasContext
    );
    const host = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(host, "offsetWidth", { value: 1000 });
    const osmd = new OpenSheetMusicDisplay(host, {
      backend: "svg",
      autoResize: false,
      renderSingleHorizontalStaffline: true
    });
    try {
      await osmd.load(musicXmlWithClayColors(xml));
      osmd.render();
      setStaffColors(osmd, "#ffffff", "#eeeeee", true);
      osmd.render();
      paintStaffNotes(osmd, "#ffffff", true);
      const notes = osmd.GraphicSheet.MeasureList.flatMap((row) =>
        row.flatMap((m) =>
          m.staffEntries.flatMap((e) => e.graphicalVoiceEntries.flatMap((v) => v.notes))
        )
      );
      const heads = notes.filter(
        (note): note is VexFlowGraphicalNote => note instanceof VexFlowGraphicalNote
      );
      expect(heads.slice(0, 3).map((note) => feedbackNotehead(note)?.getAttribute("fill"))).toEqual(
        [CLAY_NOTES.C.color, CLAY_NOTES.E.color, CLAY_NOTES.G.color]
      );
      const paths = [...host.querySelectorAll("path")].map((path) => path.getAttribute("d"));
      expect(host.querySelectorAll(".vf-notehead").length).toBeGreaterThan(5);
      applyStaffClayMaterial(host, true);
      expect([...host.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual(
        paths
      );
      expect(host.querySelectorAll(".vf-notehead[data-clay-glyph]").length).toBeGreaterThan(5);
      expect(host.querySelectorAll(".vf-clef[data-clay-glyph]").length).toBeGreaterThanOrEqual(2);
      expect(host.querySelectorAll('[data-clay-glyph="line"]').length).toBeGreaterThanOrEqual(10);
      expect(host.querySelectorAll("defs[data-clay-material]")).toHaveLength(1);
      applyStaffClayMaterial(host, true);
      expect(host.querySelectorAll("defs[data-clay-material]")).toHaveLength(1);
    } finally {
      osmd.clear();
      host.remove();
      vi.restoreAllMocks();
    }
  });
});
