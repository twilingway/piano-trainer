/** The visible duration above the keyboard, derived only from song time. */
export function holdBounds(
  start: number,
  duration: number,
  time: number,
  lookAhead: number,
  hitY: number
): { top: number; bottom: number } {
  const pixelsPerSecond = hitY / lookAhead;
  return {
    top: Math.max(0, hitY - (start + duration - time) * pixelsPerSecond),
    bottom: Math.min(hitY, hitY - (start - time) * pixelsPerSecond)
  };
}

/** Flat bars retain their small-note minimum while consuming their tail at the keyboard. */
export function flatHoldBounds(
  start: number,
  duration: number,
  time: number,
  lookAhead: number,
  hitY: number,
  gap: number,
  minimum: number
): { top: number; bottom: number } {
  const pixelsPerSecond = hitY / lookAhead;
  const bottom = Math.max(0, Math.min(hitY, hitY - (start - time) * pixelsPerSecond));
  if (time >= start + duration) return { top: bottom, bottom };
  const height = Math.max(duration * pixelsPerSecond - gap, minimum);
  return { top: Math.max(0, hitY - (start - time) * pixelsPerSecond - height), bottom };
}

/** Complete road bars are revealed only once their tail fits above the horizon. */
export function visibleHold(
  start: number,
  duration: number,
  time: number,
  lookAhead: number,
  hitY: number,
  gap: number,
  minimum: number,
  complete: boolean
) {
  const bottom = hitY - ((start - time) * hitY) / lookAhead;
  const noteHeight = Math.max((duration * hitY) / lookAhead - gap, minimum);
  return {
    bottom,
    noteHeight,
    visible: complete
      ? start + duration <= time + lookAhead && time < start + duration
      : bottom > 0 && bottom - noteHeight < hitY,
    bounds: holdBounds(start, duration, time, lookAhead, hitY),
    bodyBounds: flatHoldBounds(start, duration, time, lookAhead, hitY, gap, minimum)
  };
}
