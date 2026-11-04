// @vitest-environment happy-dom
import { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import { describe, expect, it, vi } from "vitest";
import { CLAY_NOTES, musicXmlWithClayColors } from "../song/clayNotes";
import { paintStaffNotes, setStaffColors } from "./staffNoteColors";

const note = (
  step: string,
  octave: number,
  duration: number,
  type: string,
  extra = "",
  stem = "up"
) =>
  `<note>${extra}<pitch><step>${step}</step><octave>${String(octave)}</octave></pitch><duration>${String(duration)}</duration><type>${type}</type><stem>${stem}</stem></note>`;
const rest = (duration: number, type: string) =>
  `<note><rest/><duration>${String(duration)}</duration><type>${type}</type></note>`;
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", 4, 2, "quarter")}${note("D", 4, 2, "quarter")}${note("E", 4, 4, "half")}</measure><measure number="2">${note("C", 5, 1, "eighth", "", "down")}${rest(1, "eighth")}${note("E", 5, 4, "half", "", "down")}${rest(2, "quarter")}</measure><measure number="3">${note("C", 4, 2, "quarter")}${note("E", 4, 2, "quarter", "<chord/>")}${rest(4, "half")}${rest(2, "quarter")}</measure><measure number="4">${note("C", 4, 4, "half")}${note("C", 5, 4, "half", "<chord/>")}${rest(4, "half")}</measure><measure number="5">${note("C", 4, 1, "eighth", '<beam number="1">begin</beam>')}${note("D", 4, 1, "eighth", '<beam number="1">end</beam>')}${rest(6, "half")}</measure></part></score-partwise>`;

describe("clay pitch ink in installed OSMD", () => {
  it("colours actual individual stems and flags, preserves mixed chord and shared beam ink", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({ measureText: (s: string) => ({ width: s.length * 7 }) }) as unknown as GPUCanvasContext
    );
    const host = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(host, "offsetWidth", { value: 1200 });
    const osmd = new OpenSheetMusicDisplay(host, {
      backend: "svg",
      autoResize: false,
      renderSingleHorizontalStaffline: true
    });
    try {
      await osmd.load(musicXmlWithClayColors(xml));
      setStaffColors(osmd, "#55ccff", "#aabbcc", true);
      osmd.render();
      paintStaffNotes(osmd, "#55ccff", true);
      const pitched = osmd.GraphicSheet.MeasureList.flatMap((row) =>
        row.flatMap((measure) =>
          measure.staffEntries.flatMap((entry) =>
            entry.graphicalVoiceEntries.flatMap((voice) => voice.notes)
          )
        )
      ).filter(
        (n): n is VexFlowGraphicalNote =>
          n instanceof VexFlowGraphicalNote && !n.sourceNote.isRest()
      );
      expect(pitched).toHaveLength(11);
      expect(pitched[0]?.getStemSVG().outerHTML).toContain(CLAY_NOTES.C.color);
      expect(pitched[1]?.getStemSVG().outerHTML).toContain(CLAY_NOTES.D.color);
      expect(pitched[3]?.getStemSVG().outerHTML).toContain(CLAY_NOTES.C.color);
      expect(pitched[3]?.getFlagSVG().outerHTML).toContain(CLAY_NOTES.C.color);
      expect(pitched[5]?.vfnote[0]).toBe(pitched[6]?.vfnote[0]);
      expect(pitched[5]?.getStemSVG().outerHTML).toContain("#55ccff");
      expect(pitched[7]?.vfnote[0]).toBe(pitched[8]?.vfnote[0]);
      expect(pitched[7]?.getStemSVG().outerHTML).toContain(CLAY_NOTES.C.color);
      const beam = host.querySelector(".vf-beam");
      expect(beam?.outerHTML).toContain("#55ccff");
      expect(beam?.outerHTML).not.toContain(CLAY_NOTES.C.color);
      expect(beam?.outerHTML).not.toContain(CLAY_NOTES.D.color);
      // An independent/control rendering still uses the player's saved cyan everywhere.
      setStaffColors(osmd, "#55ccff", "#aabbcc", false);
      osmd.render();
      paintStaffNotes(osmd, "#55ccff", false);
      const ordinary =
        osmd.GraphicSheet.MeasureList[0]?.[0]?.staffEntries[0]?.graphicalVoiceEntries[0]?.notes[0];
      expect(ordinary instanceof VexFlowGraphicalNote && ordinary.getStemSVG().outerHTML).toContain(
        "#55ccff"
      );
    } finally {
      osmd.clear();
      host.remove();
      vi.restoreAllMocks();
    }
  });
});
