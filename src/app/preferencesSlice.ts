import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DeviceRange } from "../input/deviceRange";
import { DEFAULT_DEVICE_RANGE } from "../input/deviceRange";
import type { KeyLightSettings } from "../input/keyLights";
import { DEFAULT_KEY_LIGHTS } from "../input/keyLights";
import type { KeyBinding, KeyboardPrefs, KeyboardPreset } from "../input/keyboardLayouts";
import { DEFAULT_KEYBOARD_PREFS } from "../input/keyboardLayouts";
import type { OutputChoice } from "../input/midiOutput";
import type { GamePreferences } from "./gamePreferences";
import { DEFAULT_GAME_PREFERENCES } from "./gamePreferences";
import type { PlayerPrefs } from "./playerPrefs";
import { DEFAULT_PLAYER_PREFS } from "./playerPrefs";
import type { StaffPrefs } from "./staffPreferences";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { DEFAULT_SCREEN_LAYOUTS, normalizeLayout } from "./screenLayout";
import type { LayoutMode, ScreenLayout, ScreenLayouts } from "./screenLayout";
import type { TimingPreferences } from "./timingPreferences";
import { defaultTimingPreferences } from "./timingPreferences";
import {
  normalizeWordTypingPrefs,
  updateWordTypingPrefs,
  type WordTypingPrefs
} from "./wordTypingPreferences";

export interface PreferencesState {
  player: PlayerPrefs;
  staff: StaffPrefs;
  keyboard: KeyboardPrefs;
  word: WordTypingPrefs;
  game: GamePreferences;
  layouts: ScreenLayouts;
  deviceRange: DeviceRange;
  midiOutput: OutputChoice | null;
  keyLights: KeyLightSettings;
  fullscreen: boolean;
  timing: TimingPreferences;
}

const initialState: PreferencesState = {
  player: DEFAULT_PLAYER_PREFS,
  staff: DEFAULT_STAFF_PREFS,
  keyboard: DEFAULT_KEYBOARD_PREFS,
  word: normalizeWordTypingPrefs(null, "ru"),
  game: DEFAULT_GAME_PREFERENCES,
  layouts: DEFAULT_SCREEN_LAYOUTS,
  deviceRange: DEFAULT_DEVICE_RANGE,
  midiOutput: null,
  keyLights: DEFAULT_KEY_LIGHTS,
  fullscreen: true,
  timing: defaultTimingPreferences()
};

// Every store replaces defaults with validated preloaded preferences before consumers mount.
const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    playerChanged(state, action: PayloadAction<Partial<PlayerPrefs>>) {
      state.player = { ...state.player, ...action.payload };
    },
    staffChanged(state, action: PayloadAction<Partial<StaffPrefs>>) {
      const change = action.payload;
      state.staff = {
        ...state.staff,
        ...change,
        ...(change.noteCards === undefined ? {} : { noteCardsConfigured: true })
      };
      if (change.road !== undefined && !state.staff.noteCardsConfigured)
        state.staff.noteCards = !change.road;
    },
    keyboardChanged(state, action: PayloadAction<KeyboardPrefs>) {
      state.keyboard = action.payload;
    },
    keyboardPresetChosen(state, action: PayloadAction<KeyboardPreset>) {
      state.keyboard.preset = action.payload;
    },
    keyboardBindingAssigned(state, action: PayloadAction<{ code: string; binding: KeyBinding }>) {
      const { preset } = state.keyboard;
      state.keyboard.overrides[preset] = {
        ...state.keyboard.overrides[preset],
        [action.payload.code]: action.payload.binding
      };
    },
    keyboardReset(state) {
      const { [state.keyboard.preset]: removed, ...remaining } = state.keyboard.overrides;
      state.keyboard.overrides = remaining;
    },
    wordChanged(
      state,
      action: PayloadAction<Partial<Omit<WordTypingPrefs, "languageManuallyChosen">>>
    ) {
      state.word = updateWordTypingPrefs(state.word, action.payload);
    },
    wordLanguageFollowed(state, action: PayloadAction<WordTypingPrefs["language"]>) {
      if (!state.word.languageManuallyChosen) state.word.language = action.payload;
    },
    gameChanged(state, action: PayloadAction<Partial<GamePreferences>>) {
      state.game = { ...state.game, ...action.payload };
    },
    layoutChanged(
      state,
      action: PayloadAction<{ mode: LayoutMode; change: Partial<ScreenLayout> }>
    ) {
      const { mode, change } = action.payload;
      state.layouts[mode] = normalizeLayout(
        { ...state.layouts[mode], ...change },
        DEFAULT_SCREEN_LAYOUTS[mode]
      );
    },
    layoutReset(state, action: PayloadAction<LayoutMode>) {
      state.layouts[action.payload] = DEFAULT_SCREEN_LAYOUTS[action.payload];
    },
    deviceRangeChanged(state, action: PayloadAction<DeviceRange>) {
      state.deviceRange = action.payload;
    },
    midiOutputChanged(state, action: PayloadAction<OutputChoice | null>) {
      state.midiOutput = action.payload;
    },
    keyLightsChanged(state, action: PayloadAction<KeyLightSettings>) {
      state.keyLights = action.payload;
    },
    fullscreenChanged(state, action: PayloadAction<boolean>) {
      state.fullscreen = action.payload;
    },
    timingChanged(state, action: PayloadAction<TimingPreferences>) {
      state.timing = action.payload;
    }
  }
});
export const preferencesActions = preferencesSlice.actions;
export const preferencesReducer = preferencesSlice.reducer;
