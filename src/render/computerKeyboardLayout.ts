import { KEYBOARD_ROWS, keyColumn } from "../wordTyping/keyboardRows";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry, ViewParts } from "./viewGeometry";

/** A computer key on screen: its code, its column's stand-in pitch and its face. */
export interface KeyFace {
  readonly code: string;
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How far each row is set in, in key widths, as on a real keyboard: the letter rows start after
 * Tab, Caps Lock and Shift, which the mode does not use and leaves as room.
 */
const ROW_OFFSET = [0, 1.5, 1.75, 2.25] as const;
/** The widest row with its offset (Tab, the letters and the backslash), in key widths. */
const UNITS = 14.5;
/** The gap between keys, as a share of a key. */
const GAP_SHARE = 0.08;
/** A key's face height, in key widths, before the view's height caps it. */
const ROW_PER_UNIT = 0.78;
/** Of the view, the keys take at most this share while the notes fall above them. */
const MAX_KEYBOARD_SHARE = 0.42;
/** The felt over the keys and the margin under them, in key widths. */
const FELT_PER_UNIT = 0.06;
const MARGIN_PER_UNIT = 0.12;

/** Where the keys, the felt and the hit line go for a computer keyboard `total` pixels wide. */
export function computerGeometry(height: number, total: number, parts: ViewParts): Geometry {
  const unit = total / UNITS;
  if (!parts.keys) {
    return {
      keyboardTop: height,
      keyboardHeight: 0,
      blackHeight: 0,
      whiteWidth: unit,
      hitY: height,
      feltHeight: 0
    };
  }
  const feltHeight = Math.max(3, unit * FELT_PER_UNIT);
  const margin = unit * MARGIN_PER_UNIT;
  const room = parts.notes ? height * MAX_KEYBOARD_SHARE : height - margin - feltHeight;
  const keyboardHeight = Math.max(0, Math.min(unit * ROW_PER_UNIT * KEYBOARD_ROWS.length, room));
  const keyboardTop = height - margin - keyboardHeight;
  return {
    keyboardTop,
    keyboardHeight,
    blackHeight: 0,
    whiteWidth: unit,
    hitY: keyboardTop - feltHeight,
    feltHeight
  };
}

/**
 * The computer keys in their four staggered rows across `total` pixels, the rows sharing
 * `geometry`'s keyboard height; and each key's column for the falling notes, as wide as its face.
 */
export function layoutComputerKeys(
  total: number,
  geometry: Geometry
): { readonly faces: readonly KeyFace[]; readonly keys: Map<number, KeyRect> } {
  const unit = total / UNITS;
  const rowHeight = geometry.keyboardHeight / KEYBOARD_ROWS.length;
  const faces: KeyFace[] = [];
  const keys = new Map<number, KeyRect>();
  KEYBOARD_ROWS.forEach((row, rowIndex) => {
    row.forEach((code, index) => {
      const pitch = keyColumn(code);
      if (pitch === undefined) return;
      const x = (ROW_OFFSET[rowIndex] ?? 0) * unit + index * unit + (unit * GAP_SHARE) / 2;
      const width = unit * (1 - GAP_SHARE);
      faces.push({
        code,
        pitch,
        x,
        y: geometry.keyboardTop + rowIndex * rowHeight + (rowHeight * GAP_SHARE) / 2,
        width,
        height: rowHeight * (1 - GAP_SHARE)
      });
      keys.set(pitch, { pitch, black: false, x, width });
    });
  });
  return { faces, keys };
}
