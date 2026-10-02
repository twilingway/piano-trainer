import { isBlackKey } from "../fingering/fingering";
import { HIGHEST_PITCH, LOWEST_PITCH, whiteKeysBetween, widenRange } from "./keyboardLayout";

/*
 * The keyboard's height follows its key width, like a real key, long and
 * narrow, and nothing else: a staff zoomed in takes room from the falling
 * notes, never from the keys, and stickers on or off leave the keys alone.
 * Stickers only shorten the black keys, to leave a white key room for one.
 */
const KEY_LENGTH_PER_WIDTH = 3.6;
const KEYBOARD_MIN_PX = 110;
const MAX_KEYBOARD_SHARE = 0.6;
const BLACK_KEY_HEIGHT = 0.62;
const BLACK_KEY_HEIGHT_WITH_STICKERS = 0.5;
/** Room under the keys for the palms of the drawn hands, in white-key widths and at most a share. */
const HANDS_STRIP_PER_WIDTH = 3;
const MAX_HANDS_SHARE = 0.25;
/** A margin under the keys, so they do not sit on the view's edge, in white-key widths. */
const BOTTOM_MARGIN_PER_WIDTH = 0.2;
/** The felt strip's height, in white-key widths. */
const FELT_PER_WIDTH = 0.22;

/** White keys stay 44 CSS pixels wide on every viewport and in every range mode. */
const WHITE_KEY_WIDTH_PX = 44;

export interface Geometry {
  readonly keyboardTop: number;
  readonly keyboardHeight: number;
  readonly blackHeight: number;
  readonly whiteWidth: number;
  /** Where notes meet the keys: the top of the felt over them, or the view's bottom without keys. */
  readonly hitY: number;
  readonly feltHeight: number;
}

/** Which parts are on screen: the falling notes, the keyboard, the hands over it. */
export interface ViewParts {
  readonly notes: boolean;
  readonly keys: boolean;
  readonly hands: boolean;
}

/** Where the keys, the felt and the hit line go in a view `height` tall. */
export function viewGeometry(
  height: number,
  whiteWidth: number,
  parts: ViewParts,
  stickers: boolean
): Geometry {
  if (!parts.keys) {
    const none = { keyboardHeight: 0, blackHeight: 0, feltHeight: 0 };
    return { ...none, keyboardTop: height, hitY: height, whiteWidth };
  }
  const feltHeight = Math.max(3, whiteWidth * FELT_PER_WIDTH);
  const blackOf = (keyboardHeight: number) =>
    keyboardHeight * (stickers ? BLACK_KEY_HEIGHT_WITH_STICKERS : BLACK_KEY_HEIGHT);
  // The palms reach below the keys, into a strip of their own; without hands a margin stays.
  const margin = whiteWidth * BOTTOM_MARGIN_PER_WIDTH;
  const strip = parts.hands
    ? Math.max(margin, Math.min(whiteWidth * HANDS_STRIP_PER_WIDTH, height * MAX_HANDS_SHARE))
    : margin;
  const wanted = Math.max(KEYBOARD_MIN_PX, whiteWidth * KEY_LENGTH_PER_WIDTH);
  // Only the keys: they keep their length, not stretched over the view, and may use all of it.
  const room = parts.notes ? height * MAX_KEYBOARD_SHARE : height - strip - feltHeight;
  const keyboardHeight = Math.max(0, Math.min(wanted, room));
  const keyboardTop = height - strip - keyboardHeight;
  return {
    keyboardTop,
    keyboardHeight,
    blackHeight: blackOf(keyboardHeight),
    whiteWidth,
    hitY: keyboardTop - feltHeight,
    feltHeight
  };
}

/** The keys to lay out and the keyboard's whole width: wider than the view when it scrolls. */
export interface FittedRange {
  readonly low: number;
  readonly high: number;
  readonly total: number;
}

/**
 * Keeps every key at its fixed CSS width. A song range can grow to fill the
 * viewport, but a full piano never stretches and wide ranges remain scrollable.
 */
export function fitRange(
  width: number,
  low: number,
  high: number,
  fitsSong: boolean,
  fitWholeSong = false
): FittedRange {
  // Match layoutKeyboard's white edges when calculating the actual key count.
  const first = Math.max(LOWEST_PITCH, isBlackKey(low) ? low - 1 : low);
  const last = Math.min(HIGHEST_PITCH, isBlackKey(high) ? high + 1 : high);
  if (!fitsSong) {
    return { low, high, total: whiteKeysBetween(first, last) * WHITE_KEY_WIDTH_PX };
  }
  low = first;
  high = last;
  if (fitWholeSong) {
    [low, high] = widenRange(low, high, whiteKeysBetween(low, high) + 2);
  }
  [low, high] = widenRange(low, high, Math.ceil(width / WHITE_KEY_WIDTH_PX));
  return { low, high, total: whiteKeysBetween(low, high) * WHITE_KEY_WIDTH_PX };
}
