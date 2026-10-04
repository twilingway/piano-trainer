/** The computer keys of the word mode as they lie: the digit row, then the three letter rows. */
export const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  [
    "Backquote",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal"
  ],
  [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
    "BracketLeft",
    "BracketRight",
    "Backslash"
  ],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]
];

/**
 * The first key's stand-in pitch. The falling notes find their key by pitch, and one pitch may
 * sit on several computer keys, so in the word mode each key is a column of its own instead.
 */
const FIRST_COLUMN = 36;
const KEYS = KEYBOARD_ROWS.flat();
const COLUMN_OF = new Map(KEYS.map((code, index) => [code, FIRST_COLUMN + index]));

/** The stand-in pitch of a computer key's column; undefined for a key the mode does not use. */
export function keyColumn(code: string): number | undefined {
  return COLUMN_OF.get(code);
}

/** The computer key of a column's stand-in pitch. */
export function columnKey(pitch: number): string | undefined {
  return KEYS[pitch - FIRST_COLUMN];
}
