export interface NoteNameLabelBounds {
  readonly top: number;
  readonly bottom: number;
}

/** Place a chord stack against one unchanged local baseline, not the preceding label. */
export function localNoteNamePositions(
  baseline: number,
  labels: readonly NoteNameLabelBounds[],
  gap: number
): number[] {
  let top = baseline;
  return labels.map((label) => {
    const y = top - label.top;
    top = y + label.bottom + gap;
    return y;
  });
}
