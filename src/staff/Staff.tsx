import { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import { useEffect, useRef } from "react";

interface StaffProps {
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
  /** 1 = OSMD's own size. */
  readonly zoom: number;
  /** One endless line that scrolls sideways, or systems wrapped to the width like a printed page. */
  readonly singleLine: boolean;
  /** Keep the cursor in view as the song plays. */
  readonly follow: boolean;
}

const BEAT_EPSILON = 1e-6;
const HIGHLIGHT = "#e63946";

function cursorBeat(osmd: OpenSheetMusicDisplay): number {
  // OSMD counts in whole notes.
  return osmd.cursor.Iterator.currentTimeStamp.RealValue * 4;
}

/** Walks the cursor to the last entry at or before `beat`. */
function moveCursor(osmd: OpenSheetMusicDisplay, beat: number): void {
  const cursor = osmd.cursor;
  if (cursorBeat(osmd) > beat + BEAT_EPSILON) cursor.reset();
  for (;;) {
    const peek = cursor.Iterator.clone();
    peek.moveToNext();
    if (peek.EndReached || peek.currentTimeStamp.RealValue * 4 > beat + BEAT_EPSILON) break;
    cursor.next();
  }
}

/** Colours the noteheads under the cursor; returns them so the next move can restore them. */
function highlightUnderCursor(
  osmd: OpenSheetMusicDisplay,
  previous: readonly SVGElement[]
): SVGElement[] {
  for (const element of previous) element.style.removeProperty("fill");
  const painted: SVGElement[] = [];
  for (const note of osmd.cursor.GNotesUnderCursor()) {
    if (!(note instanceof VexFlowGraphicalNote)) continue;
    for (const head of note.getNoteheadSVGs()) {
      for (const shape of [head, ...Array.from(head.querySelectorAll("path"))]) {
        if (!(shape instanceof SVGElement)) continue;
        shape.style.fill = HIGHLIGHT;
        painted.push(shape);
      }
    }
  }
  return painted;
}

/** Scrolls the host only when the cursor leaves the comfortable middle of it. */
function keepCursorInView(host: HTMLElement, cursor: HTMLElement): void {
  const box = host.getBoundingClientRect();
  const mark = cursor.getBoundingClientRect();
  let left = 0;
  let top = 0;
  if (mark.left < box.left + box.width * 0.1 || mark.right > box.left + box.width * 0.7) {
    left = mark.left - box.left - box.width * 0.25;
  }
  if (mark.top < box.top || mark.bottom > box.bottom) top = mark.top - box.top - box.height * 0.15;
  if (left !== 0 || top !== 0) host.scrollBy({ left, top, behavior: "smooth" });
}

/**
 * The score under a cursor that follows the song by beats rather than by
 * seconds, so tempo changes cannot drift it off; the notes under it are
 * coloured. Zoom, line wrapping and following are the reader's choice.
 */
export function Staff({ musicXml, beat, zoom, singleLine, follow }: StaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const paintedRef = useRef<SVGElement[]>([]);
  // Read by the loader and the zoom effect, which must land the cursor where the song is.
  const latest = useRef({ beat, zoom, follow });

  useEffect(() => {
    latest.current = { beat, zoom, follow };
  });

  const showBeat = (osmd: OpenSheetMusicDisplay, host: HTMLElement) => {
    moveCursor(osmd, latest.current.beat);
    paintedRef.current = highlightUnderCursor(osmd, paintedRef.current);
    if (latest.current.follow) keepCursorInView(host, osmd.cursor.cursorElement);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const osmd = new OpenSheetMusicDisplay(host, {
      backend: "svg",
      // A wrapped page re-flows when the window changes; a single line never needs to.
      autoResize: !singleLine,
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      // Off by default for a one-part score; the fingers are the point here.
      drawFingerings: true,
      renderSingleHorizontalStaffline: singleLine,
      followCursor: false
    });
    void osmd.load(musicXml).then(() => {
      if (cancelled) return;
      osmd.Zoom = latest.current.zoom;
      osmd.render();
      osmd.cursor.show();
      osmdRef.current = osmd;
      paintedRef.current = [];
      showBeat(osmd, host);
    });
    return () => {
      cancelled = true;
      osmdRef.current = null;
      osmd.clear();
      // clear() empties the score but leaves its sized SVG behind, stacked over the next one.
      host.replaceChildren();
    };
  }, [musicXml, singleLine]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host || osmd.Zoom === zoom) return;
    osmd.Zoom = zoom;
    osmd.render();
    // A new render draws new noteheads and puts the cursor back at the start.
    paintedRef.current = [];
    osmd.cursor.reset();
    showBeat(osmd, host);
  }, [zoom]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    showBeat(osmd, host);
  }, [beat]);

  return <div className="staff" ref={hostRef} />;
}
