import type { Finger } from "../fingering/fingering";

/**
 * One colour a finger, the same on both hands, as on a touch-typing chart:
 * look at the colour and you know which finger plays.
 */
export const FINGER_COLOR: Readonly<Record<Finger, number>> = {
  1: 0xff9d00,
  2: 0xffee00,
  3: 0x00ff7b,
  4: 0x00d9ff,
  5: 0xd900ff
};
