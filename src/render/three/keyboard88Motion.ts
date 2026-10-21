export const KEYBOARD88_HAND_APPROACH_SECONDS = 0.5;
export const KEYBOARD88_HAND_RELEASE_SECONDS = 0.3;
export const KEYBOARD88_FINGER_PRESS_SECONDS = 0.05;
export const KEYBOARD88_FINGER_RELEASE_SECONDS = 0.08;
export const KEYBOARD88_PIN_PRESS_SECONDS = 0.04;
export const KEYBOARD88_PIN_RELEASE_SECONDS = 0.04;
export const KEYBOARD88_PIN_MAX_SHIFT_METRES = 0.05;
export const KEYBOARD88_EVENT_TIME_EPSILON = 0.001;
export const KEYBOARD88_REPEAT_GAP_SECONDS = 0.13;
export const KEYBOARD88_REPEAT_SCALE_SECONDS = 0.26;

export function keyboard88MinJerk(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return t * t * t * (10 + t * (-15 + 6 * t));
}
