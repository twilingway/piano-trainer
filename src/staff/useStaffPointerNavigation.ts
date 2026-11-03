import { useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { seekStaffAt, type StaffDrag } from "./staffCursorNavigation";
import type { NoteIndex } from "./staffNoteIndex";

/** Movement that turns a press on the score from a click into a drag, px. */
const DRAG_THRESHOLD_PX = 5;

/** Scroll the drawn score by hand; only an undragged click seeks to a rendered notehead. */
export function useStaffPointerNavigation(
  hostRef: RefObject<HTMLDivElement | null>,
  noteIndexRef: RefObject<NoteIndex>,
  onSeek: ((beat: number) => void) | undefined
) {
  const dragRef = useRef<StaffDrag | null>(null);
  const suppressClickRef = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const host = hostRef.current;
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        left: host?.scrollLeft ?? 0,
        top: host?.scrollTop ?? 0,
        dragged: false
      };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;
      const host = hostRef.current;
      if (!drag || !host || (event.buttons & 1) === 0) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // Grabbing the score and pulling it scrolls it, like a page under the hand.
      drag.dragged = true;
      host.scrollLeft = drag.left - dx;
      host.scrollTop = drag.top - dy;
    },
    onPointerUp() {
      // A drag is not a click: letting go after pulling the score must not start the song.
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.dragged) suppressClickRef.current = true;
    },
    onClick(event: MouseEvent<HTMLDivElement>) {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      seekStaffAt(noteIndexRef.current, onSeek, event.clientX, event.clientY);
    }
  };
}
