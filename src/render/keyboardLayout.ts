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

/**
 * Horizontal placement of the keys from `low` to `high` across `width`
 * pixels. A range that starts or ends on a black key is widened to the white
 * key beside it, so the keyboard never ends in half a key.
 */
export function layoutKeyboard(
  width: number,
  low: number = LOWEST_PITCH,
  high: number = HIGHEST_PITCH
): Map<number, KeyRect> {
  const first = Math.max(LOWEST_PITCH, isBlackKey(low) ? low - 1 : low);
  const last = Math.min(HIGHEST_PITCH, isBlackKey(high) ? high + 1 : high);
  let whiteCount = 0;
  for (let pitch = first; pitch <= last; pitch++) {
    if (!isBlackKey(pitch)) whiteCount++;
  }
  const whiteWidth = width / whiteCount;
  const blackWidth = whiteWidth * BLACK_WIDTH_RATIO;
  const keys = new Map<number, KeyRect>();
  let whiteIndex = 0;
  for (let pitch = first; pitch <= last; pitch++) {
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

/** White keys from `low` to `high`, both included. */
export function whiteKeysBetween(low: number, high: number): number {
  let count = 0;
  for (let pitch = low; pitch <= high; pitch++) if (!isBlackKey(pitch)) count++;
  return count;
}

/**
 * Widens `low`–`high` to `whites` white keys, a key at a time on alternate
 * sides so the song stays in the middle, and never past the piano's ends.
 * A range already that wide is returned as it is.
 */
export function widenRange(low: number, high: number, whites: number): [number, number] {
  let from = low;
  let to = high;
  let below = true;
  while (whiteKeysBetween(from, to) < whites && (from > LOWEST_PITCH || to < HIGHEST_PITCH)) {
    const canGoDown = from > LOWEST_PITCH;
    const canGoUp = to < HIGHEST_PITCH;
    if ((below && canGoDown) || !canGoUp) {
      from--;
      while (from > LOWEST_PITCH && isBlackKey(from)) from--;
    } else {
      to++;
      while (to < HIGHEST_PITCH && isBlackKey(to)) to++;
    }
    below = !below;
  }
  return [from, to];
}
