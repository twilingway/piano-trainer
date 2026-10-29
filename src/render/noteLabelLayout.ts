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

/**
 * Where a leaning note's axis crosses screen row `y`, from its near end (`bottomX` at `bottomY`)
 * to its far end `height` rows up. Undefined without both ends.
 */
export function noteAxisX(
  bottomX: number | undefined,
  topX: number | undefined,
  bottomY: number,
  height: number,
  y: number
): number | undefined {
  if (bottomX === undefined || topX === undefined || !(height > 0)) return undefined;
  return bottomX + ((topX - bottomX) * (bottomY - y)) / height;
}

/** A road label is hidden this far before its note reaches the keys and fully shown from 2 s. */
export const FINGER_LABEL_FADE_START_S = 3;
export const FINGER_LABEL_FADE_END_S = 2;

/**
 * How visible a road label is `secondsToHit` before its note lands: far notes crowd the horizon,
 * so the label fades in over the last approach instead of appearing at once.
 */
export function fingerLabelAlpha(secondsToHit: number): number {
  const share =
    (FINGER_LABEL_FADE_START_S - secondsToHit) /
    (FINGER_LABEL_FADE_START_S - FINGER_LABEL_FADE_END_S);
  return Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 1;
}
