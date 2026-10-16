/** Keep a dense horizontal score readable without changing audio or saved zoom. */
export function fittedTimelineZoom(
  currentZoom: number,
  pixelsPerSecond: number,
  preferredZoom: number
): number {
  if (pixelsPerSecond <= 0 || !Number.isFinite(pixelsPerSecond)) return currentZoom;
  const target = 210 * preferredZoom;
  const minimum = 0.6 * preferredZoom;
  return Math.min(currentZoom, Math.max(minimum, (currentZoom * target) / pixelsPerSecond));
}
