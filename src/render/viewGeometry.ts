import { whiteKeysBetween, widenRange } from "./keyboardLayout";

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

/*
 * With the keys fitted to the song, a white key is kept between these widths,
 * in CSS pixels, on any screen. A short song gets more keys round it rather
 * than giant ones; a wide one keeps playable keys and the view scrolls along
 * the keyboard to the keys to play next.
 */
const SONG_WHITE_MIN_PX = 56;
const SONG_WHITE_MAX_PX = 90;

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
  // Only the keys: they take the whole view, whatever its height.
  if (!parts.notes) {
    const keyboardHeight = height - strip - feltHeight;
    return {
      keyboardTop: feltHeight,
      keyboardHeight,
      blackHeight: blackOf(keyboardHeight),
      whiteWidth,
      hitY: 0,
      feltHeight
    };
  }
  const wanted = Math.max(KEYBOARD_MIN_PX, whiteWidth * KEY_LENGTH_PER_WIDTH);
  const keyboardHeight = Math.min(wanted, height * MAX_KEYBOARD_SHARE);
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
 * Fits the keys `low`..`high` to a view `width` wide. A fixed range fills the
 * view as it is; one that follows the song keeps its white keys playable.
 */
export function fitRange(width: number, low: number, high: number, fitsSong: boolean): FittedRange {
  if (!fitsSong) return { low, high, total: width };
  const whites = Math.max(1, whiteKeysBetween(low, high));
  if (width / whites > SONG_WHITE_MAX_PX) {
    // Few keys: more round the song, so none is giant.
    const [wideLow, wideHigh] = widenRange(low, high, Math.ceil(width / SONG_WHITE_MAX_PX));
    return { low: wideLow, high: wideHigh, total: width };
  }
  if (width / whites < SONG_WHITE_MIN_PX) {
    // Many keys: keep them playable and scroll.
    return { low, high, total: whites * SONG_WHITE_MIN_PX };
  }
  return { low, high, total: width };
}
