import type { Finger } from "../fingering/fingering";

/**
 * One colour a finger, the same on both hands, as on a touch-typing chart:
 * look at the colour and you know which finger plays.
 */
export const FINGER_COLOR: Readonly<Record<Finger, number>> = {
  1: 0xb54cff,
  2: 0xffe052,
  3: 0x00baff,
  4: 0xff780a,
  5: 0x00e89c
};
