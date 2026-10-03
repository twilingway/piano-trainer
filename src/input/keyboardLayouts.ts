export const PRESET_IDS = ["extended_range", "octave_layout", "bass_chords"] as const;
export type KeyboardPreset = (typeof PRESET_IDS)[number];
export type KeyBinding =
  | { readonly type: "note"; readonly pitch: number }
  | { readonly type: "sustain" | "octaveDown" | "octaveUp" | "disabled" };
export type KeyboardBindings = Readonly<Record<string, KeyBinding>>;
export interface KeyboardPrefs {
  readonly version: 1;
  readonly preset: KeyboardPreset;
  readonly overrides: Partial<Record<KeyboardPreset, KeyboardBindings>>;
}
export const DEFAULT_KEYBOARD_PREFS: KeyboardPrefs = {
  version: 1,
  preset: "extended_range",
  overrides: {}
};
export const PRESET_TITLES: Record<KeyboardPreset, string> = {
  extended_range: "Широкий диапазон",
  octave_layout: "По октавам",
  bass_chords: "Бас и аккорды"
};
export const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  [
    "Backquote",
    ...Array.from({ length: 10 }, (_, i) => `Digit${String((i + 1) % 10)}`),
    "Minus",
    "Equal",
    "Backspace"
  ],
  [
    "Tab",
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
  [
    "CapsLock",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
    "Quote",
    "Enter"
  ],
  [
    "ShiftLeft",
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
    "ShiftRight"
  ],
  [
    "ControlLeft",
    "AltLeft",
    "Space",
    "AltRight",
    "ControlRight",
    "ArrowLeft",
    "ArrowDown",
    "ArrowUp",
    "ArrowRight"
  ]
];
const LABELS: Record<string, string> = {
  Backquote: "`",
  Minus: "−",
  Equal: "=",
  Backspace: "⌫",
  Tab: "Tab",
  CapsLock: "Caps",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Enter: "Enter",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  Space: "Пробел",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowDown: "↓",
  ArrowUp: "↑"
};
export function keyLabel(code: string): string {
  return LABELS[code] ?? code.replace(/^(Key|Digit|Numpad)/, "");
}
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
export function pitchLabel(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12] ?? "?"}${String(Math.floor(pitch / 12) - 1)}`;
}
export function bindingLabel(binding: KeyBinding | undefined): string {
  if (!binding || binding.type === "disabled") return "—";
  if (binding.type === "note") return pitchLabel(binding.pitch);
  return { sustain: "Педаль", octaveDown: "Октава −", octaveUp: "Октава +" }[binding.type];
}
const NOTE_CODES = [
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
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Semicolon",
  "KeyZ",
  "KeyX",
  "KeyC",
  "KeyV",
  "KeyB",
  "KeyN",
  "KeyM",
  "Comma",
  "Period",
  "Slash"
];
const PITCHES: Record<KeyboardPreset, readonly number[]> = {
  extended_range: [
    71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 36, 38, 40, 41,
    43, 45, 47, 48, 50, 52
  ],
  octave_layout: [
    72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 48, 50, 52, 53,
    55, 57, 59, 60, 62, 64
  ],
  bass_chords: [
    48, 50, 52, 53, 55, 72, 74, 76, 77, 79, 41, 43, 45, 47, 48, 65, 67, 69, 71, 72, 36, 38, 40, 41,
    43, 60, 62, 64, 65, 67
  ]
};
export function presetBindings(preset: KeyboardPreset): KeyboardBindings {
  const bindings: Record<string, KeyBinding> = {
    Space: { type: "sustain" },
    ArrowDown: { type: "octaveDown" },
    ArrowUp: { type: "octaveUp" }
  };
  NOTE_CODES.forEach((code, i) => {
    bindings[code] = { type: "note", pitch: PITCHES[preset][i] ?? 60 };
  });
  return bindings;
}
export function effectiveBindings(prefs: KeyboardPrefs): KeyboardBindings {
  return { ...presetBindings(prefs.preset), ...prefs.overrides[prefs.preset] };
}
export function isAssignableCode(code: string): boolean {
  return (
    /^(Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|F(?:[1-9]|1[0-2]))$/.test(
      code
    ) ||
    [
      "Backquote",
      "Minus",
      "Equal",
      "Backspace",
      "Tab",
      "CapsLock",
      "BracketLeft",
      "BracketRight",
      "Backslash",
      "Semicolon",
      "Quote",
      "Enter",
      "Comma",
      "Period",
      "Slash",
      "Space",
      "ArrowLeft",
      "ArrowRight",
      "ArrowDown",
      "ArrowUp",
      "Insert",
      "Delete",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "IntlBackslash"
    ].includes(code)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validBinding(value: unknown): value is KeyBinding {
  if (!isRecord(value)) return false;
  if (value.type === "note")
    return (
      typeof value.pitch === "number" &&
      Number.isInteger(value.pitch) &&
      value.pitch >= 0 &&
      value.pitch <= 127
    );
  return ["sustain", "octaveDown", "octaveUp", "disabled"].includes(String(value.type));
}
export function parseKeyboardPrefs(value: unknown): KeyboardPrefs {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !PRESET_IDS.includes(value.preset as KeyboardPreset) ||
    !isRecord(value.overrides)
  )
    return DEFAULT_KEYBOARD_PREFS;
  const overrides: Partial<Record<KeyboardPreset, KeyboardBindings>> = {};
  for (const preset of PRESET_IDS) {
    const raw = value.overrides[preset];
    if (raw === undefined) continue;
    if (!isRecord(raw)) return DEFAULT_KEYBOARD_PREFS;
    const bindings: Record<string, KeyBinding> = {};
    for (const [code, binding] of Object.entries(raw)) {
      if (!isAssignableCode(code) || !validBinding(binding)) return DEFAULT_KEYBOARD_PREFS;
      bindings[code] =
        binding.type === "note" ? { type: "note", pitch: binding.pitch } : { type: binding.type };
    }
    overrides[preset] = bindings;
  }
  return { version: 1, preset: value.preset as KeyboardPreset, overrides };
}
