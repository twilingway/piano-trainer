import { isBlackKey } from "../fingering/fingering";
import type { KeyRect } from "./keyboardLayout";

/** Atlas metres and the single metres-to-scene conversion used by keys, case and performer. */
export const KEYBOARD_METRES = 1000;
export const KEYBOARD_WHITE_STEP = 23.5;
export const KEYBOARD_WHITE_WIDTH = 22.5;
export const KEYBOARD_BLACK_WIDTH = 13.31152;
export const KEYBOARD_DEPTH = 150;
export const KEYBOARD_BLACK_FRONT = 55.7766;
export const KEYBOARD_BLACK_BACK = 149.8008;
export const KEYBOARD_DIP = 8;
export const KEYBOARD_C4 = { x: 0.36, y: 0.74, z: -0.3 } as const;

/** White-slot positions relative to C4; black keys occupy the exact intervening seam. */
export function metricKeyX(pitch: number): number {
  let steps = 0;
  if (pitch >= 60) {
    for (let key = 60; key < pitch; key++) if (!isBlackKey(key)) steps++;
  } else {
    for (let key = pitch; key < 60; key++) if (!isBlackKey(key)) steps--;
  }
  return (steps - (isBlackKey(pitch) ? 0.5 : 0)) * KEYBOARD_WHITE_STEP;
}

export function metricSourceUnits(keys: Iterable<KeyRect>): number {
  for (const key of keys)
    if (!key.black && Number.isFinite(key.width) && key.width > 0)
      return KEYBOARD_WHITE_STEP / key.width;
  return 0.5;
}

/** C4's unpanned scene X, derived from any visible white key without stretching the piano. */
export function metricC4X(keys: Iterable<KeyRect>, sourceX: (source: number) => number): number {
  for (const key of keys)
    if (!key.black) return sourceX(key.x + key.width / 2) - metricKeyX(key.pitch);
  return 0;
}
