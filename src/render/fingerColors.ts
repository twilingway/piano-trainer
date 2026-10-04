import type { Finger, Hand } from "../fingering/fingering";

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

/** A note without a finger: its hand's colour. */
export const HAND_COLOR: Readonly<Record<Hand, number>> = {
  right: FINGER_COLOR[3],
  left: FINGER_COLOR[4]
};

/**
 * The word-typing palette, as on a touch-typing chart: the index fingers tell the hands apart
 * (left orange, right yellow), the other fingers share a colour on both hands; no thumbs type,
 * so the middle fingers take the thumb's purple.
 */
export const TYPING_FINGER_COLOR: Readonly<Record<Hand, Readonly<Record<Finger, number>>>> = {
  left: {
    1: FINGER_COLOR[1],
    2: FINGER_COLOR[4],
    3: FINGER_COLOR[1],
    4: FINGER_COLOR[3],
    5: FINGER_COLOR[5]
  },
  right: {
    1: FINGER_COLOR[1],
    2: FINGER_COLOR[2],
    3: FINGER_COLOR[1],
    4: FINGER_COLOR[3],
    5: FINGER_COLOR[5]
  }
};

/** A colour `share` of the way to white. */
export function towardWhite(color: number, share: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.round(value + (255 - value) * share) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}
