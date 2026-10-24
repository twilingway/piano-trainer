/** Keep the direct flat note face as wide and readable as the accepted native note. */
export const NOTE_WIDTH_SHARE = 1.08;
export const READABLE_NOTE_DURATION_LIMIT = 0.6;

/** Existing 3D minima, shared without changing its materials or projection. */
export function readableNoteFaceHeight(width: number, perspective: boolean): number {
  return perspective
    ? Math.max(24, Math.min(64, width * 0.8))
    : Math.max(18, Math.min(30, width * 0.8));
}

/** Sustained notes consume completely; only short attacks need a readable face minimum. */
export function flatNoteMinimumHeight(keyWidth: number, duration: number): number {
  return duration < READABLE_NOTE_DURATION_LIMIT
    ? readableNoteFaceHeight(keyWidth * NOTE_WIDTH_SHARE, false)
    : 0;
}
