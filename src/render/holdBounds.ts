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
