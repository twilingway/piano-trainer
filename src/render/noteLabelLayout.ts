/** Fit a baked label within the note's interior; unreadably small labels stay hidden. */
export function fitNoteLabel(
  width: number,
  height: number,
  textureWidth: number,
  textureHeight: number,
  maximumHeight: number
): number {
  if (width <= 0 || height <= 0 || textureWidth <= 0 || textureHeight <= 0) return 0;
  const scale = Math.min(
    1,
    width / textureWidth,
    height / textureHeight,
    maximumHeight / textureHeight
  );
  return textureHeight * scale >= 6 ? scale : 0;
}

/** Keep text clear of the bright rim, including the ends of short notes. */
export function noteLabelInset(width: number, height: number): number {
  return Math.max(0, Math.min(4, width * 0.1, height * 0.12));
}
