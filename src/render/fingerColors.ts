import type { Finger } from "../fingering/fingering";

/**
 * One colour a finger, the same on both hands, as on a touch-typing chart:
 * look at the colour and you know which finger plays.
 */
export const FINGER_COLOR: Readonly<Record<Finger, number>> = {
  1: 0xd52bff,
  2: 0xffe63b,
  3: 0x00c8ff,
  4: 0xff9800,
  5: 0x00ff66
};
