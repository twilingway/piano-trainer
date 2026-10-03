import { DEFAULT_KEYBOARD_PREFS, parseKeyboardPrefs } from "../input/keyboardLayouts";
import type { KeyboardPrefs } from "../input/keyboardLayouts";
const STORAGE_KEY = "computer-keyboard-v1";
export function loadKeyboardPrefs(): KeyboardPrefs {
  try {
    return parseKeyboardPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_KEYBOARD_PREFS;
  }
}
export function saveKeyboardPrefs(prefs: KeyboardPrefs): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
