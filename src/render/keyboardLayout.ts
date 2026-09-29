import { isBlackKey } from "../fingering/fingering";

/** A0 to C8, the 88 keys of a full piano. */
export const LOWEST_PITCH = 21;
export const HIGHEST_PITCH = 108;
const BLACK_WIDTH_RATIO = 0.6;

export interface KeyRect {
  readonly pitch: number;
  readonly black: boolean;
  readonly x: number;
  readonly width: number;
}

/** Horizontal placement of every key across `width` pixels. */
export function layoutKeyboard(width: number): Map<number, KeyRect> {
  let whiteCount = 0;
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (!isBlackKey(pitch)) whiteCount++;
  }
  const whiteWidth = width / whiteCount;
  const blackWidth = whiteWidth * BLACK_WIDTH_RATIO;
  const keys = new Map<number, KeyRect>();
  let whiteIndex = 0;
  for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
    if (isBlackKey(pitch)) {
      // A black key sits on the seam between the white key before it and the one after.
      keys.set(pitch, {
        pitch,
        black: true,
        x: whiteIndex * whiteWidth - blackWidth / 2,
        width: blackWidth
      });
    } else {
      keys.set(pitch, { pitch, black: false, x: whiteIndex * whiteWidth, width: whiteWidth });
      whiteIndex++;
    }
  }
  return keys;
}
