import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { positionInTabs, type TabRow } from "./pianoTabsLayout";

/** Animation reads the trainer clock; it never extrapolates musical time. */
export function useTabsCursor(
  scrollRef: RefObject<HTMLDivElement | null>,
  rows: readonly TabRow[],
  beat: number,
  liveBeat: (() => number) | undefined,
  follow: boolean,
  overflowing: boolean
) {
  const latest = useRef({ rows, beat, liveBeat, follow, overflowing });
  useLayoutEffect(() => {
    latest.current = { rows, beat, liveBeat, follow, overflowing };
  });
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    let frame = 0,
      lastFrame = performance.now(),
      lastBeat: number | undefined,
      manualUntil = 0,
      dragging = false;
    const hold = () => {
      manualUntil = performance.now() + 2500;
    };
    const beginDrag = () => {
      dragging = true;
      hold();
    };
    const endDrag = () => {
      if (dragging) {
        dragging = false;
        hold();
      }
    };
    host.addEventListener("pointerdown", beginDrag, { passive: true });
    window.addEventListener("pointerup", endDrag, { passive: true });
    window.addEventListener("pointercancel", endDrag, { passive: true });
    for (const type of ["wheel", "touchstart", "keydown"] as const)
      host.addEventListener(type, hold, { passive: true });
    const systems = Array.from(host.querySelectorAll<HTMLElement>(".piano-tabs__system"));
    const grids = systems.map((system) => system.querySelector<HTMLElement>(".piano-tabs__grid"));
    const cursors = systems.map((system) =>
      system.querySelector<HTMLElement>(".piano-tabs__cursor")
    );
    const notes = Array.from(host.querySelectorAll<HTMLElement>(".piano-tabs__note")).map(
      (element) => ({
        element,
        start: Number(element.dataset.start),
        end: Number(element.dataset.end)
      })
    );
    const columns = Array.from(host.querySelectorAll<HTMLElement>(".piano-tabs__column")).map(
      (element) => ({
        element,
        start: Number(element.dataset.beat),
        end: Number(element.dataset.end)
      })
    );
    const highlights = [...notes, ...columns];
    const draw = (now: number) => {
      const current = latest.current;
      const currentBeat = current.liveBeat?.() ?? current.beat;
      const spot = positionInTabs(current.rows, currentBeat);
      systems.forEach((system, index) => {
        const cursor = cursors[index];
        if (!cursor) return;
        cursor.style.visibility = index === spot?.row ? "visible" : "hidden";
        if (index === spot?.row) cursor.style.transform = `translateX(${String(spot.x)}px)`;
      });
      for (const note of highlights) {
        const active = String(note.start <= currentBeat && currentBeat < note.end);
        if (note.element.dataset.current !== active) note.element.dataset.current = active;
      }
      const system = spot ? systems[spot.row] : undefined;
      const grid = spot ? grids[spot.row] : undefined;
      if (
        spot &&
        system &&
        grid &&
        current.follow &&
        !dragging &&
        now >= manualUntil &&
        currentBeat !== lastBeat
      ) {
        const ease = 1 - Math.exp(-Math.min(0.1, (now - lastFrame) / 1000) / 0.35);
        const bounds = grid.getBoundingClientRect();
        const view = host.getBoundingClientRect();
        if (current.overflowing) {
          const wanted = Math.max(
            0,
            bounds.left - view.left + host.scrollLeft + spot.x - host.clientWidth / 2
          );
          const difference = wanted - host.scrollLeft;
          const jumped = lastBeat === undefined || Math.abs(currentBeat - lastBeat) > 0.5;
          host.scrollLeft +=
            jumped || Math.abs(difference) > host.clientWidth * 3 ? difference : difference * ease;
        }
        const wantedTop = Math.max(
          0,
          system.getBoundingClientRect().top - view.top + host.scrollTop - 4
        );
        host.scrollTop +=
          lastBeat === undefined || Math.abs(currentBeat - lastBeat) > 0.5
            ? wantedTop - host.scrollTop
            : (wantedTop - host.scrollTop) * ease;
      }
      lastBeat = currentBeat;
      lastFrame = now;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointerdown", beginDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      for (const type of ["wheel", "touchstart", "keydown"] as const)
        host.removeEventListener(type, hold);
    };
  }, [scrollRef, rows]);
}
