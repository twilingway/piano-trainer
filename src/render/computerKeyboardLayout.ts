import { KEYBOARD_ROWS, keyColumn } from "../wordTyping/keyboardRows";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry, ViewParts } from "./viewGeometry";

/** A key on screen: a typing key has its column's stand-in pitch, a service key its caption. */
export interface KeyFace {
  readonly code: string;
  readonly pitch?: number;
  /** A service key's caption (Tab, Shift…); a typing key shows what it types instead. */
  readonly caption?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Slot {
  readonly code: string;
  /** In key widths. */
  readonly width: number;
  readonly caption?: string;
}

const key = (code: string, width = 1): Slot => ({ code, width });
const service = (code: string, width: number, caption = ""): Slot => ({ code, width, caption });
const row = (index: number) => (KEYBOARD_ROWS[index] ?? []).map((code) => key(code));

/**
 * A full keyboard, 15 key widths a row, as it lies under the hands: the typing keys of the mode
 * among the service keys around them, which only show where the hands are.
 */
const LAYOUT: readonly (readonly Slot[])[] = [
  [...row(0), service("Backspace", 2, "⟵ Backspace")],
  [
    service("Tab", 1.5, "Tab"),
    ...row(1).map((slot) => (slot.code === "Backslash" ? key("Backslash", 1.5) : slot))
  ],
  [service("CapsLock", 1.75, "Caps Lock"), ...row(2), service("Enter", 2.25, "Enter ⏎")],
  [service("ShiftLeft", 2.25, "⇧ Shift"), ...row(3), service("ShiftRight", 2.75, "⇧ Shift")],
  [
    service("ControlLeft", 1.25, "Ctrl"),
    service("MetaLeft", 1.25, "Win"),
    service("AltLeft", 1.25, "Alt"),
    service("Space", 6.25),
    service("AltRight", 1.25, "Alt"),
    service("MetaRight", 1.25, "Win"),
    service("ContextMenu", 1.25, "☰"),
    service("ControlRight", 1.25, "Ctrl")
  ]
];
/** Key widths across a row. */
const UNITS = 15;
/** The gap between keys, as a share of a key width. */
const GAP_SHARE = 0.1;
/** A row's height, in key widths, before the view's height caps it. */
const ROW_PER_UNIT = 0.8;
/** A key at most this wide: a wide screen does not blow the keyboard up. */
const MAX_UNIT_PX = 56;
/** Of the view, the keys take at most this share while the notes fall above them. */
const MAX_KEYBOARD_SHARE = 0.4;
/** The felt over the keys and the margin under them, in key widths. */
const FELT_PER_UNIT = 0.06;
const MARGIN_PER_UNIT = 0.15;

/** The keyboard's width in a view `width` wide: as wide as a real one at most, centred. */
export function computerWidth(width: number): number {
  return Math.min(width, UNITS * MAX_UNIT_PX);
}

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
  const keyboardHeight = Math.max(0, Math.min(unit * ROW_PER_UNIT * LAYOUT.length, room));
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
 * Every key across `total` pixels in its row, the rows sharing `geometry`'s keyboard height;
 * and each typing key's column for the falling notes, as wide as its face.
 */
export function layoutComputerKeys(
  total: number,
  geometry: Geometry
): { readonly faces: readonly KeyFace[]; readonly keys: Map<number, KeyRect> } {
  const unit = total / UNITS;
  const rowHeight = geometry.keyboardHeight / LAYOUT.length;
  const gap = unit * GAP_SHARE;
  // A short keyboard keeps its rows apart without crushing them.
  const rowGap = Math.min(gap, rowHeight * 0.14);
  const faces: KeyFace[] = [];
  const keys = new Map<number, KeyRect>();
  LAYOUT.forEach((slots, line) => {
    let left = 0;
    for (const slot of slots) {
      const x = left * unit + gap / 2;
      const width = slot.width * unit - gap;
      const pitch = slot.caption === undefined ? keyColumn(slot.code) : undefined;
      faces.push({
        code: slot.code,
        ...(pitch === undefined ? {} : { pitch }),
        ...(slot.caption === undefined ? {} : { caption: slot.caption }),
        x,
        y: geometry.keyboardTop + line * rowHeight + rowGap / 2,
        width,
        height: rowHeight - rowGap
      });
      if (pitch !== undefined) keys.set(pitch, { pitch, black: false, x, width });
      left += slot.width;
    }
  });
  return { faces, keys };
}
