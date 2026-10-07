import { createListenerMiddleware, type ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import { parseDeviceRange } from "../input/deviceRange";
import { DEFAULT_KEY_LIGHTS } from "../input/keyLights";
import { parseKeyboardPrefs } from "../input/keyboardLayouts";
import { normalizeGamePreferences } from "./gamePreferences";
import { getInterfaceLanguage } from "./interfaceLanguage";
import { normalizePlayerPrefs } from "./playerPrefs";
import type { PreferencesState } from "./preferencesSlice";
import { persistenceErrorChanged, type PersistenceState } from "./persistenceSlice";
import { DEFAULT_SCREEN_LAYOUTS, normalizeLayout } from "./screenLayout";
import { normalizeStaffPrefs } from "./staffPreferences";
import { loadTimingPreferences } from "./timingPreferences";
import { normalizeWordTypingPrefs } from "./wordTypingPreferences";

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export interface PreferenceRoot {
  preferences: PreferencesState;
  persistence: PersistenceState;
}
export const PREFERENCE_KEYS = {
  player: "player-prefs",
  staff: "staff-prefs",
  keyboard: "computer-keyboard-v1",
  word: "word-typing-prefs-v1",
  game: "game-options-v1",
  layouts: "screen-layout",
  deviceRange: "device-range-v1",
  midiOutput: "midi-output-v1",
  keyLights: "key-lights-v1",
  fullscreen: "fullscreen-preferred",
  timing: "piano-trainer:timing-v1"
} satisfies Record<keyof PreferencesState, string>;
export const persistenceKey = (key: string, operation: "read" | "write") =>
  `localStorage:${key}:${operation}`;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const integer = (value: unknown, low: number, high: number, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high
    ? value
    : fallback;

export function browserPreferenceStorage(): PreferenceStorage {
  // Access itself can throw in restricted browser contexts, so defer it until each operation.
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
    }
  };
}
export function loadPreferences(storage: PreferenceStorage = browserPreferenceStorage()) {
  const errors: Record<string, string> = {};
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      errors[persistenceKey(key, "read")] = "unavailable";
      return null;
    }
  };
  const json = (key: string): unknown => {
    const raw = read(key);
    try {
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      errors[persistenceKey(key, "read")] = "invalid";
      return null;
    }
  };
  const layouts = record(json(PREFERENCE_KEYS.layouts));
  const lights = record(json(PREFERENCE_KEYS.keyLights));
  const output = record(json(PREFERENCE_KEYS.midiOutput));
  const mobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px), (pointer: coarse) and (max-height: 640px)").matches;
  const preferences: PreferencesState = {
    player: normalizePlayerPrefs(json(PREFERENCE_KEYS.player)),
    staff: normalizeStaffPrefs(json(PREFERENCE_KEYS.staff), mobile),
    keyboard: parseKeyboardPrefs(json(PREFERENCE_KEYS.keyboard)),
    word: normalizeWordTypingPrefs(json(PREFERENCE_KEYS.word), getInterfaceLanguage()),
    game: normalizeGamePreferences(json(PREFERENCE_KEYS.game)),
    layouts: {
      piano: normalizeLayout(layouts.piano, DEFAULT_SCREEN_LAYOUTS.piano),
      typing: normalizeLayout(layouts.typing, DEFAULT_SCREEN_LAYOUTS.typing)
    },
    deviceRange: parseDeviceRange(json(PREFERENCE_KEYS.deviceRange)),
    midiOutput:
      typeof output.id === "string" && typeof output.name === "string"
        ? { id: output.id, name: output.name }
        : null,
    keyLights: {
      enabled: typeof lights.enabled === "boolean" ? lights.enabled : DEFAULT_KEY_LIGHTS.enabled,
      channel: integer(lights.channel, 1, 16, DEFAULT_KEY_LIGHTS.channel),
      velocity: integer(lights.velocity, 1, 127, DEFAULT_KEY_LIGHTS.velocity)
    },
    fullscreen: read(PREFERENCE_KEYS.fullscreen) !== "false",
    timing: loadTimingPreferences({
      getItem: (key) => {
        const value = json(key);
        return value === null ? null : JSON.stringify(value);
      }
    })
  };
  return { preferences, persistence: { errors } };
}
export function createPersistenceListener<State extends PreferenceRoot = PreferenceRoot>() {
  return createListenerMiddleware<State>();
}
export function registerPreferencePersistence<State extends PreferenceRoot>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage = browserPreferenceStorage()
) {
  return listener.startListening({
    predicate: (_action, current, previous) => current.preferences !== previous.preferences,
    effect: (_action, api) => {
      const previous = api.getOriginalState().preferences;
      const current = api.getState().preferences;
      for (const field of Object.keys(PREFERENCE_KEYS) as (keyof PreferencesState)[]) {
        const value =
          field === "fullscreen" ? String(current[field]) : JSON.stringify(current[field]);
        const old =
          field === "fullscreen" ? String(previous[field]) : JSON.stringify(previous[field]);
        if (value === old) continue;
        const key = PREFERENCE_KEYS[field];
        try {
          storage.setItem(key, value);
          api.dispatch(persistenceErrorChanged({ key: persistenceKey(key, "write"), error: null }));
        } catch {
          api.dispatch(
            persistenceErrorChanged({ key: persistenceKey(key, "write"), error: "unavailable" })
          );
        }
      }
    }
  });
}
