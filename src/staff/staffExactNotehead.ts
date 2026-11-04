import type { VexFlowGraphicalNote } from "opensheetmusicdisplay";

/** OSMD's public chord index matches VexFlow's note_heads / drawn vf-notehead order. */
export function feedbackNotehead(note: VexFlowGraphicalNote): SVGElement | undefined {
  const index = note.vfnoteIndex;
  if (!Number.isInteger(index) || index < 0) return undefined;
  const head = note.getNoteheadSVGs()[index];
  return head instanceof SVGElement ? head : undefined;
}
