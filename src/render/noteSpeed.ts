import { KEYBOARD_WHITE_STEP } from "./keyboardMetrics";
import type { WorldCamera } from "./worldCamera";

/**
 * One fall speed for every view, in the real piano's millimetres per second: the 3D «Прямо»
 * road with the staff on, which showed 2.22 s over its field.
 */
export const NOTE_SPEED_MM = 172;

/** Approach glow and trails look no further ahead than this, however long the field. */
export const LOOK_AHEAD_CAP_S = 6;

/**
 * Seconds a note takes from the far end of the field to the hit line. The field and the white-key
 * step are in the same units (pixels flat, world units on the road), so the speed stays in metres.
 */
export function noteLookAhead(fieldLength: number, whiteStep: number): number | undefined {
  if (!(fieldLength > 0) || !(whiteStep > 0) || !Number.isFinite(fieldLength * whiteStep))
    return undefined;
  return (fieldLength * KEYBOARD_WHITE_STEP) / (NOTE_SPEED_MM * whiteStep);
}

/** The road from the hit row to its far end, and the white-key step, both in road units. */
export function roadNoteField(
  camera: Pick<WorldCamera, "roadFarZ" | "near" | "params">,
  whiteWidth: number
): { length: number; whiteStep: number } {
  return {
    length: camera.roadFarZ - camera.near.z,
    whiteStep: whiteWidth * (camera.params.sourceUnits ?? 0.5)
  };
}

/** The look-ahead of decisions that must not change with the field length. */
export function boundedLookAhead(lookAhead: number): number {
  return Math.min(Math.max(0, lookAhead), LOOK_AHEAD_CAP_S);
}
