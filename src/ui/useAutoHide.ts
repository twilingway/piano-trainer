import { useEffect, useState } from "react";

/** Seconds of stillness before the bar goes while the song plays. */
const HIDE_AFTER_MS = 2000;
/** The strip at the top, in CSS pixels, where the pointer brings the bar back. */
const WAKE_ZONE_PX = 80;

/**
 * Whether the bar is out of the way: while `active` (the song playing), after
 * two seconds without the pointer near the top and without focus in the bar.
 * Keys never bring it back — they play notes.
 */
export function useAutoHide(active: boolean, bar: HTMLElement | null): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => {
      setHidden(true);
    }, HIDE_AFTER_MS);
    const wake = () => {
      setHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Not while the player is in the bar: a focused control keeps it.
        if (!bar?.contains(document.activeElement)) setHidden(true);
      }, HIDE_AFTER_MS);
    };
    const onPointer = (event: PointerEvent) => {
      if (event.clientY <= WAKE_ZONE_PX) wake();
    };
    const onFocus = (event: FocusEvent) => {
      if (bar && event.target instanceof Node && bar.contains(event.target)) wake();
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("focusin", onFocus);
    return () => {
      // Paused or stopped: the bar comes back and stays.
      setHidden(false);
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("focusin", onFocus);
    };
  }, [active, bar]);
  return hidden;
}
