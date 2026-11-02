import { VexFlowGraphicalNote, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

import type { BeatSpot } from "./liveCursor";
import { noteheadShapes } from "./staffNoteColors";

/** The key a mark is given under: the note's beat and MIDI pitch. */
export function markKey(beat: number, pitch: number): string {
  return `${String(Math.round(beat * 1000) / 1000)}:${String(pitch)}`;
}

export interface NoteIndex {
  /** Sounding notes only: rests cannot receive note clicks or take marks. */
  readonly beats: Map<SVGGElement, number>;
  readonly heads: Map<string, SVGElement[]>;
  /** Exact per-key heads for feedback; ordinary chord painting keeps the full shapes above. */
  readonly feedbackHeads?: Map<string, SVGElement[]>;
  /** Rest glyphs and noteheads both locate the continuous musical cursor. */
  readonly cursorBeats: Map<SVGElement, number>;
}

/** OSMD's public chord index matches VexFlow's note_heads / drawn vf-notehead order. */
export function feedbackNotehead(note: VexFlowGraphicalNote): SVGElement | undefined {
  const index = note.vfnoteIndex;
  if (!Number.isInteger(index) || index < 0) return undefined;
  const head = note.getNoteheadSVGs()[index];
  return head instanceof SVGElement ? head : undefined;
}

export function indexNotes(osmd: OpenSheetMusicDisplay): NoteIndex {
  const beats = new Map<SVGGElement, number>();
  const heads = new Map<string, SVGElement[]>();
  const feedbackHeads = new Map<string, SVGElement[]>();
  const cursorBeats = new Map<SVGElement, number>();
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      // OSMD's measure rows have holes for staves without a measure there.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      for (const entry of measure.staffEntries) {
        const beat = entry.getAbsoluteTimestamp().RealValue * 4;
        for (const voice of entry.graphicalVoiceEntries) {
          for (const note of voice.notes) {
            if (!(note instanceof VexFlowGraphicalNote)) continue;
            const element = note.getSVGGElement();
            const shapes = noteheadShapes(note);
            // A stem/beam can extend far beyond the attack: locate the notehead itself.
            cursorBeats.set(shapes[0] ?? element, beat);
            if (note.sourceNote.isRest()) continue;
            beats.set(element, beat);
            const key = markKey(beat, note.sourceNote.halfTone + 12);
            heads.set(key, [...(heads.get(key) ?? []), ...shapes]);
            const head = feedbackNotehead(note);
            if (head) feedbackHeads.set(key, [...(feedbackHeads.get(key) ?? []), head]);
          }
        }
      }
    }
  }
  return { beats, heads, feedbackHeads, cursorBeats };
}

/** Each drawn musical entry, including silence, with its SVG position and line. */
export function beatPositions(
  beats: ReadonlyMap<SVGElement, number>,
  host: HTMLElement,
  lines: readonly { readonly top: number; readonly bottom: number }[]
): BeatSpot[] {
  const svg = host.querySelector("svg");
  if (!svg) return [];
  const origin = svg.getBoundingClientRect();
  const byBeat = new Map<number, BeatSpot>();
  for (const [element, beat] of beats) {
    const box = element.getBoundingClientRect();
    if (box.width === 0) continue;
    const x = box.left + box.width / 2 - origin.left;
    const y = box.top + box.height / 2 - origin.top;
    const line = (lines.filter((item) => item.top <= y).at(-1) ?? lines[0])?.top ?? 0;
    const known = byBeat.get(beat);
    if (!known || x < known.x) byBeat.set(beat, { beat, x, line });
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

/** Hit testing uses current DOM bounds after score zoom, scrolling or centring. */
export function nearestNoteBeat(
  beats: ReadonlyMap<SVGElement, number>,
  clientX: number,
  clientY: number
): number | undefined {
  let best: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [element, beat] of beats) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    // Rows count heavily: a note on the clicked line beats a closer one on the next line.
    const dx = clientX - (box.left + box.width / 2);
    const dy = Math.max(0, Math.abs(clientY - (box.top + box.height / 2)) - box.height / 2);
    const distance = dx * dx + 16 * dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = beat;
    }
  }
  return best;
}
