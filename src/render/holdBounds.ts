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
