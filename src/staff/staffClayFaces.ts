import {
  NoteHeadShape,
  NoteType,
  VexFlowGraphicalNote,
  type OpenSheetMusicDisplay
} from "opensheetmusicdisplay";
import { feedbackNotehead } from "./staffExactNotehead";

const NS = "http://www.w3.org/2000/svg";
function shape(name: string, attributes: Readonly<Record<string, string>>) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

/** Written type, rather than sounding length, keeps dotted/tuplet hollow notes hollow. */
export function hasClayFace(note: VexFlowGraphicalNote): boolean {
  const source = note.sourceNote;
  const type = source.NoteTypeXml;
  const head = source.Notehead as typeof source.Notehead | undefined;
  // OSMD 2.1.x calls the enum value "eigth", so valid XML "eighth" yields UNDEFINED.
  // Only the engraver's explicit normal solid glyph is safe in that compatibility case.
  const glyph = note.vfnote[0].getGlyph() as unknown as { readonly code_head?: string };
  const filledType =
    (type >= NoteType._1024th && type <= NoteType.QUARTER) ||
    (type === NoteType.UNDEFINED && glyph.code_head === "vb");
  return (
    !source.isRest() &&
    source.PrintObject &&
    !source.CustomNoteheadVFCode &&
    filledType &&
    (!head || (head.Shape === NoteHeadShape.NORMAL && head.Filled))
  );
}

function drawFace(head: SVGElement): void {
  const graphics = head as SVGGraphicsElement;
  if (typeof graphics.getBBox !== "function") return;
  let box: DOMRect;
  try {
    box = graphics.getBBox();
  } catch {
    return;
  }
  if (
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    box.width <= 0 ||
    box.height <= 0
  )
    return;
  const face = shape("g", {
    "data-clay-face": "smile",
    "aria-hidden": "true",
    "pointer-events": "none",
    transform: `translate(${String(box.x)} ${String(box.y)}) scale(${String(box.width / 100)} ${String(box.height / 100)})`
  });
  // Non-path primitives keep the engraver's path recolouring away from the expression.
  // Every mark is inside the original oval, so measuring the score sees no extra ink.
  for (const x of [35, 65]) {
    face.append(
      shape("polyline", {
        points: `${String(x - 5)},43 ${String(x)},37 ${String(x + 5)},43`,
        fill: "none",
        stroke: "#352b36",
        "stroke-width": "5.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
  }
  face.append(
    shape("ellipse", { cx: "50", cy: "64", rx: "13", ry: "12", fill: "#65323d", stroke: "none" }),
    shape("ellipse", { cx: "50", cy: "69", rx: "9", ry: "5", fill: "#ff9ea7", stroke: "none" })
  );
  head.append(face);
}

/** One engraving-time pass. The expression never encodes pitch, octave or answer state. */
export function applyStaffClayFaces(
  host: HTMLElement,
  enabled: boolean,
  osmd?: OpenSheetMusicDisplay
): void {
  for (const face of host.querySelectorAll("[data-clay-face]")) face.remove();
  if (!enabled || !osmd) return;
  const painted = new Set<SVGElement>();
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      // OSMD measure rows can be sparse for hidden staves.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      for (const entry of measure.staffEntries) {
        for (const voice of entry.graphicalVoiceEntries) {
          for (const note of voice.notes) {
            if (!(note instanceof VexFlowGraphicalNote) || !hasClayFace(note)) continue;
            const head = feedbackNotehead(note);
            if (!head || painted.has(head) || !host.contains(head)) continue;
            drawFace(head);
            painted.add(head);
          }
        }
      }
    }
  }
}
