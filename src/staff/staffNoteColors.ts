import { VexFlowGraphicalNote } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const HIGHLIGHT = "#e63946";

/** A notehead and its paths, so review and live colours reach the entire glyph. */
export function noteheadShapes(note: VexFlowGraphicalNote): SVGElement[] {
  const shapes: SVGElement[] = [];
  for (const head of note.getNoteheadSVGs()) {
    for (const shape of [head, ...Array.from(head.querySelectorAll("path"))]) {
      if (shape instanceof SVGElement) shapes.push(shape);
    }
  }
  return shapes;
}

function restoreFill(shape: SVGElement): void {
  const mark = shape.dataset.mark;
  if (mark) shape.style.fill = mark;
  else shape.style.removeProperty("fill");
}

export function highlightUnderCursor(
  osmd: OpenSheetMusicDisplay,
  previous: readonly SVGElement[]
): SVGElement[] {
  for (const element of previous) restoreFill(element);
  const painted: SVGElement[] = [];
  for (const note of osmd.cursor.GNotesUnderCursor()) {
    if (!(note instanceof VexFlowGraphicalNote)) continue;
    for (const shape of noteheadShapes(note)) {
      shape.style.fill = HIGHLIGHT;
      painted.push(shape);
    }
  }
  return painted;
}

export function paintMarks(
  heads: ReadonlyMap<string, readonly SVGElement[]>,
  marks: ReadonlyMap<string, string> | undefined
): void {
  for (const [key, shapes] of heads) {
    const mark = marks?.get(key);
    for (const shape of shapes) {
      if (mark) shape.dataset.mark = mark;
      else delete shape.dataset.mark;
      restoreFill(shape);
    }
  }
}

/** Set the renderer's base colours without touching the source MusicXML or review marks. */
export function setStaffColors(
  osmd: OpenSheetMusicDisplay,
  noteColor: string,
  scoreColor: string
): void {
  osmd.setOptions({
    defaultColorMusic: scoreColor,
    defaultColorNotehead: noteColor,
    defaultColorRest: noteColor,
    defaultColorStem: noteColor,
    coloringEnabled: true,
    colorStemsLikeNoteheads: true
  });
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      // Measure rows can contain holes for absent staves.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      for (const entry of measure.staffEntries) {
        for (const voice of entry.graphicalVoiceEntries) {
          for (const note of voice.notes) {
            note.sourceNote.NoteheadColor = noteColor;
            note.sourceNote.ParentVoiceEntry.StemColor = noteColor;
          }
        }
      }
    }
  }
}

/** Beams and flags have independent SVG shapes; use OSMD's public API to colour them too. */
export function paintStaffNotes(osmd: OpenSheetMusicDisplay, noteColor: string): void {
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      for (const entry of measure.staffEntries) {
        for (const voice of entry.graphicalVoiceEntries) {
          for (const note of voice.notes) {
            note.setColor(noteColor, {
              applyToNoteheads: true,
              applyToStem: true,
              applyToBeams: true,
              applyToFlag: true,
              applyToTies: true,
              applyToSlurs: true
            });
          }
        }
      }
    }
  }
}
