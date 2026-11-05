export interface SceneRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
export interface CourseStartPlacement {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly overKeyboard: boolean;
}
/** A start layer must never cover written notes, including fingers and names below the staff. */
export function songCourseStartPlacement(
  view: SceneRect,
  score: SceneRect,
  keyboard: SceneRect,
  preferred = 112
): CourseStartPlacement | null {
  const left = Math.max(view.left, keyboard.left),
    right = Math.min(view.right, keyboard.right);
  const gapTop = Math.max(view.top + 8, score.bottom + 10);
  const gapBottom = Math.min(view.bottom, keyboard.top) - 8;
  // Portrait cue:24px line +6px vertical padding +6px gap.
  const cueHeight = 36;
  const gapSize = Math.min(preferred, right - left - 16, gapBottom - gapTop - cueHeight);
  if (gapSize >= 64)
    return {
      left: (left + right - gapSize) / 2,
      top: gapTop + (gapBottom - gapTop - gapSize - cueHeight) / 2,
      size: gapSize,
      overKeyboard: false
    };
  const top = Math.max(keyboard.top + 4, score.bottom + 8, view.top + 8);
  const bottom = Math.min(view.bottom, keyboard.bottom) - 6;
  const size = Math.min(preferred, right - left - 16, bottom - top - cueHeight);
  if (size < 44) return null;
  return {
    left: (left + right - size) / 2,
    top: top + (bottom - top - size - cueHeight) / 2,
    size,
    overKeyboard: true
  };
}
