/** World dimensions relative to the note width; shared by projection and Three geometry. */
export const NOTE_SLAB_THICKNESS = 0.18;
export const NOTE_SLAB_CORNER = 0.11;
export const NOTE_SLAB_BEVEL = 0.025;

export const WHITE_NOTE_FLOOR = 22;
export const BLACK_NOTE_FLOOR = 34;

/** Keep the white lane below the black key plane, including unusually wide custom notes. */
export function noteSlabHeight(width: number, floorY: number): number {
  const height = width * NOTE_SLAB_THICKNESS;
  return floorY === WHITE_NOTE_FLOOR
    ? Math.min(height, BLACK_NOTE_FLOOR - WHITE_NOTE_FLOOR - 0.5)
    : height;
}
