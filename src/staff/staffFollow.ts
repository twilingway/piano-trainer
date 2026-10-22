import { spotAt, type BeatSpot } from "./liveCursor";

const MANUAL_SCROLL_HOLD_MS = 2500;

/** Centres the same musical position as the visible cursor, without a second easing clock. */
export function centreLivePosition(
  host: HTMLElement,
  spots: readonly BeatSpot[],
  beat: number
): void {
  const x = spotAt(spots, beat)?.x;
  const svg = host.querySelector("svg");
  if (x === undefined || !svg) return;
  const view = host.getBoundingClientRect();
  const svgLeft = svg.getBoundingClientRect().left - view.left + host.scrollLeft;
  host.scrollLeft = svgLeft + x - view.width / 2;
}

/** Reader gestures suspend following; a held pointer remains manual until it is released. */
export function createStaffFollow(host: HTMLElement, now: () => number = () => performance.now()) {
  let manualUntil = 0;
  let dragging = false;
  let lastBeat: number | undefined;
  let wasFollowing = false;
  const hold = () => {
    manualUntil = now() + MANUAL_SCROLL_HOLD_MS;
  };
  const press = () => {
    dragging = true;
    hold();
  };
  const release = () => {
    if (!dragging) return;
    dragging = false;
    hold();
  };
  for (const type of ["wheel", "touchstart", "keydown"] as const) {
    host.addEventListener(type, hold, { passive: true });
  }
  host.addEventListener("pointerdown", press, { passive: true });
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  return {
    frame(beat: number, singleLine: boolean, follow: boolean, spots: readonly BeatSpot[]): boolean {
      const moved = beat !== lastBeat;
      const enabled = follow && !wasFollowing;
      lastBeat = beat;
      wasFollowing = follow;
      if (!follow || dragging || now() < manualUntil) return false;
      if (singleLine && (moved || enabled)) centreLivePosition(host, spots, beat);
      return true;
    },
    dispose() {
      for (const type of ["wheel", "touchstart", "keydown"] as const) {
        host.removeEventListener(type, hold);
      }
      host.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    }
  };
}
