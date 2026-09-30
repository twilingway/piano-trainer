import type { Finger } from "../fingering/fingering";

/**
 * One colour a finger, the same on both hands, as on a touch-typing chart:
 * look at the colour and you know which finger plays.
 */
export const FINGER_COLOR: Readonly<Record<Finger, number>> = {
  1: 0xf5952e,
  2: 0xf2d43a,
  3: 0x4cc45a,
  4: 0x3fb8f0,
  5: 0x9b5cf0
};
