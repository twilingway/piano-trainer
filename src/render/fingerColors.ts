import type { Finger } from "../fingering/fingering";

/**
 * One colour a finger, the same on both hands, as on a touch-typing chart:
 * look at the colour and you know which finger plays.
 */
export const FINGER_COLOR: Readonly<Record<Finger, number>> = {
  1: 0xc528f5,
  2: 0xffdb32,
  3: 0x00a9f5,
  4: 0xff9400,
  5: 0x00df50
};
