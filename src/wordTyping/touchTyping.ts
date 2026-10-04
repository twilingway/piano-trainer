import type { Finger, Hand } from "../fingering/fingering";

export interface TypingFinger {
  readonly hand: Hand;
  readonly finger: Finger;
}

/**
 * The standard touch-typing zones by physical key, the same for ЙЦУКЕН and QWERTY:
 * index 2, middle 3, ring 4, pinky 5 (the piano numbering, so the colours match).
 */
const ZONES: readonly (readonly [Hand, Finger, readonly string[]])[] = [
  ["left", 5, ["Backquote", "Digit1", "KeyQ", "KeyA", "KeyZ"]],
  ["left", 4, ["Digit2", "KeyW", "KeyS", "KeyX"]],
  ["left", 3, ["Digit3", "KeyE", "KeyD", "KeyC"]],
  ["left", 2, ["Digit4", "Digit5", "KeyR", "KeyT", "KeyF", "KeyG", "KeyV", "KeyB"]],
  ["right", 2, ["Digit6", "Digit7", "KeyY", "KeyU", "KeyH", "KeyJ", "KeyN", "KeyM"]],
  ["right", 3, ["Digit8", "KeyI", "KeyK", "Comma"]],
  ["right", 4, ["Digit9", "KeyO", "KeyL", "Period"]],
  [
    "right",
    5,
    [
      "Digit0",
      "Minus",
      "Equal",
      "KeyP",
      "BracketLeft",
      "BracketRight",
      "Backslash",
      "Semicolon",
      "Quote",
      "Slash"
    ]
  ]
];

const BY_KEY = new Map<string, TypingFinger>(
  ZONES.flatMap(([hand, finger, keys]) => keys.map((key) => [key, { hand, finger }] as const))
);

/** The finger that presses a physical key; undefined for a key outside the typing zones. */
export function typingFinger(physicalKey: string): TypingFinger | undefined {
  return BY_KEY.get(physicalKey);
}
