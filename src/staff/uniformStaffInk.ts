/** Distances from an attack column; Y remains in VexFlow's local staff pixels. */
export interface StaffInkBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
interface InkNote {
  getYs(): number[];
  getMetrics(): {
    noteWidth: number;
    extraLeftPx: number;
    extraRightPx: number;
    modLeftPx: number;
    modRightPx: number;
  };
  getGlyphWidth?: () => number;
  getXShift?: () => number;
  hasStem?: () => boolean;
  getStemExtents?: () => { topY: number; baseY: number };
  getStemDirection?: () => number;
  getStemX?: () => number;
  note_heads?: { isDisplaced(): boolean; getWidth(): number }[];
  hasFlag?: () => boolean;
  beam?: unknown;
  renderFlag?: boolean;
  stem?: { getHeight(): number };
  flag?: {
    bbox: { getX(): number; getY(): number; getW(): number; getH(): number };
    originShift: { x: number; y: number };
  };
  getModifiers(): {
    getCategory(): string;
    getPosition(): number;
    getIndex(): number;
    getXShift(): number;
    getWidth(): number;
    y_shift: number;
    glyph?: {
      bbox: { getX(): number; getY(): number; getW(): number; getH(): number };
      originShift: { x: number; y: number };
    };
  }[];
  getModifierStartXY(position: number, index: number): { x: number; y: number };
  getNoteHeadBeginX(): number;
}

/** Separate accidental/head/flag ranges so a high accidental does not reserve
 * horizontal space against a low ledger note several octaves away. */
export function staffNoteInk(note: InkNote): StaffInkBox[] {
  const metrics = note.getMetrics();
  const half = (note.getGlyphWidth?.() ?? metrics.noteWidth) / 2;
  const shift = note.getXShift?.() ?? 0;
  const ys = note.getYs();
  const boxes: StaffInkBox[] = ys.map((y, index) => {
    const head = note.note_heads?.[index];
    const displaced = head?.isDisplaced()
      ? (head.getWidth() - 0.75) * (note.getStemDirection?.() ?? 1)
      : 0;
    return {
      left: half + 2 - shift - displaced,
      right: half + 2 + shift + displaced,
      top: y - 6,
      bottom: y + 6
    };
  });
  const accidentals = note
    .getModifiers()
    .filter((modifier) => modifier.getCategory() === "accidentals");
  // VexFlow includes the voice displacement in headBegin/stemX, but LEFT
  // modifier anchors exclude it. Normalize every box to the shared attack axis.
  const center = note.getNoteHeadBeginX() + half - shift;
  for (const accidental of accidentals) {
    const glyph = accidental.glyph;
    if (!glyph) continue;
    const anchor = note.getModifierStartXY(accidental.getPosition(), accidental.getIndex());
    const x = anchor.x + accidental.getXShift() + glyph.originShift.x + glyph.bbox.getX();
    const y = anchor.y + accidental.y_shift + glyph.originShift.y + glyph.bbox.getY();
    const extra = Math.max(0, accidental.getWidth() - glyph.bbox.getW());
    boxes.push({
      left: center - x + extra,
      right: x + glyph.bbox.getW() - center,
      top: y - 1,
      bottom: y + glyph.bbox.getH() + 1
    });
  }
  const left = metrics.extraLeftPx + metrics.modLeftPx;
  if (
    left > 0 &&
    accidentals.length === 0 &&
    note.getModifiers().some((modifier) => modifier.getPosition() === 1)
  ) {
    for (const y of ys)
      boxes.push({
        left: half + left - shift,
        right: -half + 1 + shift,
        top: y - 14,
        bottom: y + 14
      });
  }
  if (
    metrics.modRightPx + metrics.extraRightPx > 0 &&
    note.getModifiers().some((modifier) => modifier.getPosition() === 2)
  ) {
    for (const y of ys)
      boxes.push({
        left: -half - shift,
        right:
          Math.max(half, metrics.noteWidth - half) +
          metrics.modRightPx +
          metrics.extraRightPx +
          shift,
        top: y - 7,
        bottom: y + 7
      });
  }
  const stem = note.hasStem?.() ? note.getStemExtents?.() : undefined;
  if (stem) {
    const stemX = note.getStemX ? note.getStemX() - center : half;
    // Chord head displacement is not stem or flag width.
    boxes.push({
      left: -stemX + 1,
      right: stemX + 1,
      top: Math.min(stem.topY, stem.baseY) - 8,
      bottom: Math.max(stem.topY, stem.baseY) + 8
    });
    const flag = note.flag;
    if (flag && note.hasFlag?.() && !note.beam && note.renderFlag !== false && note.stem) {
      const direction = note.getStemDirection?.() ?? 1;
      const y =
        direction === -1
          ? Math.min(...ys) - note.stem.getHeight() + 2
          : Math.max(...ys) - note.stem.getHeight() - 2;
      const x = stemX + flag.originShift.x + flag.bbox.getX();
      const top = y + flag.originShift.y + flag.bbox.getY();
      boxes.push({
        left: -x,
        right: x + flag.bbox.getW(),
        top: top - 1,
        bottom: top + flag.bbox.getH() + 1
      });
    }
  }
  return boxes;
}

export function overlappingInkSpace(first: readonly StaffInkBox[], second: readonly StaffInkBox[]) {
  let space = 0;
  for (const a of first)
    for (const b of second) {
      if (a.bottom >= b.top && b.bottom >= a.top) space = Math.max(space, a.right + b.left);
    }
  return space;
}
