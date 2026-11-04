/*
 * Key faces painted after the approved mockup, stretched as nine-slice
 * sprites: corners and the front bevel keep their size, the middle stretches.
 * The "lit" faces are the same keys in neutral grey, for a tint to colour
 * them. Should they fail to load, the faces baked in code stand in.
 *
 * Two styles: "classic" (src/render/keys) and "arcade" (src/render/keys-arcade),
 * thicker pseudo-3D keys over a lacquered rail.
 */
/** Keyboard appearance is independent of the notes' projection. */
export type KeyStyle = "classic" | "arcade" | "3d" | "clay";
export type NativeKeyStyle = Extract<KeyStyle, "3d" | "clay">;
export function isNativeKeyStyle(style: unknown): style is NativeKeyStyle {
  return style === "3d" || style === "clay";
}

export type FaceName =
  | "white"
  | "whiteLit"
  | "black"
  | "blackLit"
  | "whitePressed"
  | "whitePressedLit"
  | "blackPressed"
  | "blackPressedLit";

interface Slice {
  readonly leftWidth: number;
  readonly topHeight: number;
  readonly rightWidth: number;
  readonly bottomHeight: number;
}

interface StyleSet {
  readonly faces: Readonly<Record<FaceName, string>>;
  readonly white: Slice;
  readonly black: Slice;
  /** The lacquered rail under the keys, for a style that has one. */
  readonly rail?: string;
}

export const KEY_STYLES: Readonly<Record<Exclude<KeyStyle, NativeKeyStyle>, StyleSet>> = {
  classic: {
    faces: {
      white: new URL("./keys/white.webp", import.meta.url).href,
      whiteLit: new URL("./keys/white-lit.webp", import.meta.url).href,
      black: new URL("./keys/black.webp", import.meta.url).href,
      blackLit: new URL("./keys/black-lit.webp", import.meta.url).href,
      whitePressed: new URL("./keys/white-pressed.webp", import.meta.url).href,
      whitePressedLit: new URL("./keys/white-pressed-lit.webp", import.meta.url).href,
      blackPressed: new URL("./keys/black-pressed.webp", import.meta.url).href,
      blackPressedLit: new URL("./keys/black-pressed-lit.webp", import.meta.url).href
    },
    white: { leftWidth: 12, topHeight: 60, rightWidth: 14, bottomHeight: 64 },
    black: { leftWidth: 16, topHeight: 178, rightWidth: 16, bottomHeight: 76 }
  },
  arcade: {
    faces: {
      white: new URL("./keys-arcade/white.webp", import.meta.url).href,
      whiteLit: new URL("./keys-arcade/white-lit.webp", import.meta.url).href,
      black: new URL("./keys-arcade/black.webp", import.meta.url).href,
      blackLit: new URL("./keys-arcade/black-lit.webp", import.meta.url).href,
      whitePressed: new URL("./keys-arcade/white-pressed.webp", import.meta.url).href,
      whitePressedLit: new URL("./keys-arcade/white-pressed-lit.webp", import.meta.url).href,
      blackPressed: new URL("./keys-arcade/black-pressed.webp", import.meta.url).href,
      blackPressedLit: new URL("./keys-arcade/black-pressed-lit.webp", import.meta.url).href
    },
    // The pressed faces share the up faces' slices: their sunk bevel sits inside the bottom band.
    white: { leftWidth: 16, topHeight: 32, rightWidth: 16, bottomHeight: 80 },
    black: { leftWidth: 12, topHeight: 28, rightWidth: 12, bottomHeight: 88 },
    rail: new URL("./keys-arcade/case-rail.webp", import.meta.url).href
  }
};
