import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { nearestNoteBeat, type NoteIndex } from "./staffNoteIndex";

const BEAT_EPSILON = 1e-6;

function cursorBeat(osmd: OpenSheetMusicDisplay): number {
  // OSMD counts in whole notes.
  return osmd.cursor.Iterator.currentTimeStamp.RealValue * 4;
}

/** Walks the cursor to the last entry at or before `beat`. */
export function moveCursor(osmd: OpenSheetMusicDisplay, beat: number): void {
  const cursor = osmd.cursor;
  if (cursorBeat(osmd) > beat + BEAT_EPSILON) cursor.reset();
  for (;;) {
    const peek = cursor.Iterator.clone();
    peek.moveToNext();
    if (peek.EndReached || peek.currentTimeStamp.RealValue * 4 > beat + BEAT_EPSILON) break;
    cursor.next();
  }
}

/** A click seeks by the currently drawn head bounds, after the caller rejects a drag. */
export function seekStaffAt(
  index: NoteIndex,
  onSeek: ((beat: number) => void) | undefined,
  clientX: number,
  clientY: number
): void {
  if (!onSeek) return;
  const beat = nearestNoteBeat(index.beats, clientX, clientY);
  if (beat !== undefined) onSeek(beat);
}
