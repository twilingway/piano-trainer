import { KEYBOARD_WHITE_STEP } from "./keyboardMetrics";

/**
 * One fall speed for every view at the hit line, in the real piano's millimetres per second
 * (7.3 white keys a second) of the keys as the screen shows them there: the 3D «Прямо» road with
 * the staff on, which showed 2.22 s over its field. Deeper, perspective slows a note down.
 */
export const NOTE_SPEED_MM = 172;

/** Approach glow and trails look no further ahead than this, however long the field. */
export const LOOK_AHEAD_CAP_S = 6;

/**
 * Seconds a note takes from the far end of the field to the hit line. The field and the white-key
 * step are in the same units, so the speed is in white keys a second.
 */
export function noteLookAhead(fieldLength: number, whiteStep: number): number | undefined {
  if (!(fieldLength > 0) || !(whiteStep > 0) || !Number.isFinite(fieldLength * whiteStep))
    return undefined;
  return (fieldLength * KEYBOARD_WHITE_STEP) / (NOTE_SPEED_MM * whiteStep);
}

/**
 * The road's rows down to the hit line and the white key as the screen shows it at the hit line,
 * in rows: a note then crosses the same on-screen white keys a second there as on a flat lane.
 */
export function screenNoteField(
  place: (keyX: number, row: number) => { readonly x: number; readonly y: number } | undefined,
  keyX: number,
  whiteWidth: number,
  hitY: number
): { length: number; whiteStep: number } | undefined {
  const step = hitY / 100;
  const hit = place(keyX, hitY);
  const before = place(keyX, hitY - step);
  const left = place(keyX - whiteWidth / 2, hitY);
  const right = place(keyX + whiteWidth / 2, hitY);
  if (!hit || !before || !left || !right || !(step > 0)) return undefined;
  const rowScreen = Math.hypot(hit.x - before.x, hit.y - before.y) / step;
  const keyScreen = Math.hypot(right.x - left.x, right.y - left.y);
  if (!(rowScreen > 0) || !(keyScreen > 0)) return undefined;
  return { length: hitY, whiteStep: keyScreen / rowScreen };
}

/**
 * Lane rows a flat note's picture pixel spans at the hit line. A lane row is road length over the
 * lane height, far longer than a pixel across the key: the bevel and bloom stretched into long end
 * gradients and streaks. Measured at the white key nearest `centre`.
 */
export function flatPictureRows(
  place: (keyX: number, row: number) => { readonly x: number; readonly y: number } | undefined,
  keys:
    | ReadonlyMap<number, { readonly black: boolean; readonly x: number; readonly width: number }>
    | undefined,
  centre: number,
  hitY: number
): number {
  let white: { readonly x: number; readonly width: number } | undefined;
  for (const key of keys?.values() ?? [])
    if (
      !key.black &&
      (!white ||
        Math.abs(key.x + key.width / 2 - centre) < Math.abs(white.x + white.width / 2 - centre))
    )
      white = key;
  if (!white) return 1;
  const field = screenNoteField(place, white.x + white.width / 2, white.width, hitY);
  const rows = field ? field.whiteStep / white.width : 1;
  return Number.isFinite(rows) && rows > 0 ? rows : 1;
}

/** The look-ahead of decisions that must not change with the field length. */
export function boundedLookAhead(lookAhead: number): number {
  return Math.min(Math.max(0, lookAhead), LOOK_AHEAD_CAP_S);
}
