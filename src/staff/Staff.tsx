import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef } from "react";

interface StaffProps {
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
}

const BEAT_EPSILON = 1e-6;

function cursorBeat(osmd: OpenSheetMusicDisplay): number {
  // OSMD counts in whole notes.
  return osmd.cursor.Iterator.currentTimeStamp.RealValue * 4;
}

/**
 * The score as one long line that scrolls under a cursor. The cursor is moved
 * by beats rather than by seconds, so tempo changes cannot drift it off.
 */
export function Staff({ musicXml, beat }: StaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const osmd = new OpenSheetMusicDisplay(host, {
      backend: "svg",
      autoResize: false,
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      renderSingleHorizontalStaffline: true,
      followCursor: true
    });
    void osmd.load(musicXml).then(() => {
      if (cancelled) return;
      osmd.render();
      osmd.cursor.show();
      osmdRef.current = osmd;
    });
    return () => {
      cancelled = true;
      osmdRef.current = null;
      osmd.clear();
    };
  }, [musicXml]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd) return;
    const cursor = osmd.cursor;
    if (cursorBeat(osmd) > beat + BEAT_EPSILON) cursor.reset();
    for (;;) {
      const peek = cursor.Iterator.clone();
      peek.moveToNext();
      if (peek.EndReached || peek.currentTimeStamp.RealValue * 4 > beat + BEAT_EPSILON) break;
      cursor.next();
    }
  }, [beat]);

  return <div className="staff" ref={hostRef} />;
}
