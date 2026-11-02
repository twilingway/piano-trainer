import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DeviceRange } from "../input/deviceRange";
import { DEFAULT_DEVICE_RANGE } from "../input/deviceRange";
import type { KeyLightSettings } from "../input/keyLights";
import { DEFAULT_KEY_LIGHTS } from "../input/keyLights";
import type { KeyBinding, KeyboardPrefs, KeyboardPreset } from "../input/keyboardLayouts";
import { DEFAULT_KEYBOARD_PREFS } from "../input/keyboardLayouts";
import { AUTO_OUTPUT_CHOICE, type OutputChoice } from "../input/midiOutput";
import { DEFAULT_MELODY_OUTPUT, type MelodyOutputSettings } from "../input/melodyOutput";
import type { GamePreferences } from "./gamePreferences";
import { DEFAULT_GAME_PREFERENCES } from "./gamePreferences";
import {
  DEFAULT_INSTRUMENT_PROFILE_PREFERENCES,
  normalizeInstrumentProfilePreferences,
  type InstrumentProfilePreferences
} from "./instrumentProfilePreferences";
import type { PlayerPrefs } from "./playerPrefs";
import { DEFAULT_PLAYER_PREFS } from "./playerPrefs";
import type { StaffPrefs } from "./staffPreferences";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import { DEFAULT_SCREEN_LAYOUTS, normalizeLayout } from "./screenLayout";
import type { LayoutMode, ScreenLayout, ScreenLayouts } from "./screenLayout";
import type { TimingPreferences } from "./timingPreferences";
import { defaultTimingPreferences } from "./timingPreferences";
import {
  activeViewFraming,
  DEFAULT_VIEW_FRAMING,
  editViewCamera,
  hydrateViewProfiles,
  saveViewFraming,
  selectViewProfile,
  type ViewAxes,
  type ViewFraming,
  type ViewProfiles
} from "./viewProfiles";
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
  viewProfiles: ViewProfiles;
  deviceRange: DeviceRange;
  midiOutput: OutputChoice | null;
  keyLights: KeyLightSettings;
  melodyOutput: MelodyOutputSettings;
  instrumentProfiles: InstrumentProfilePreferences;
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
  viewProfiles: hydrateViewProfiles(null, DEFAULT_STAFF_PREFS, DEFAULT_SCREEN_LAYOUTS.piano),
  deviceRange: DEFAULT_DEVICE_RANGE,
  midiOutput: AUTO_OUTPUT_CHOICE,
  keyLights: DEFAULT_KEY_LIGHTS,
  melodyOutput: DEFAULT_MELODY_OUTPUT,
  instrumentProfiles: DEFAULT_INSTRUMENT_PROFILE_PREFERENCES,
  fullscreen: true,
  timing: defaultTimingPreferences()
};

const currentFraming = (state: PreferencesState): ViewFraming => ({
  camera: state.staff.camera,
  roadFar: state.staff.roadFar,
  roadHorizon: state.staff.roadHorizon,
  layout: state.layouts.piano
});
function restoreFraming(state: PreferencesState, framing: ViewFraming) {
  state.staff = {
    ...state.staff,
    camera: framing.camera,
    roadFar: framing.roadFar,
    roadHorizon: framing.roadHorizon,
    keyStyle: state.viewProfiles.active.keyboardStyle,
    road: state.viewProfiles.active.notesProjection === "perspective",
    keyboardOrientation: state.viewProfiles.active.keyboardOrientation
  };
  state.layouts = { ...state.layouts, piano: framing.layout };
}
function selectProfile(state: PreferencesState, selection: Partial<ViewAxes>) {
  const next = selectViewProfile(state.viewProfiles, currentFraming(state), selection);
  state.viewProfiles = next.profiles;
  restoreFraming(state, next.framing);
}
function saveFraming(state: PreferencesState) {
  state.viewProfiles = saveViewFraming(state.viewProfiles, currentFraming(state));
  restoreFraming(state, activeViewFraming(state.viewProfiles));
}

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
      if (
        change.keyStyle !== undefined ||
        change.road !== undefined ||
        change.keyboardOrientation !== undefined
      )
        selectProfile(state, {
          ...(change.keyStyle === undefined ? {} : { keyboardStyle: change.keyStyle }),
          ...(change.road === undefined
            ? {}
            : { notesProjection: change.road ? "perspective" : "direct" }),
          ...(change.keyboardOrientation === undefined
            ? {}
            : { keyboardOrientation: change.keyboardOrientation })
        });
      const previousCamera = state.staff.camera;
      state.staff = {
        ...state.staff,
        ...change,
        keyStyle: state.viewProfiles.active.keyboardStyle,
        road: state.viewProfiles.active.notesProjection === "perspective",
        keyboardOrientation: state.viewProfiles.active.keyboardOrientation,
        ...(change.noteCards === undefined ? {} : { noteCardsConfigured: true })
      };
      if (change.road !== undefined && !state.staff.noteCardsConfigured)
        state.staff.noteCards = !change.road;
      if (change.camera !== undefined) {
        const edited = editViewCamera(
          state.viewProfiles,
          { ...currentFraming(state), camera: previousCamera },
          change.camera
        );
        state.viewProfiles = edited.profiles;
        restoreFraming(state, edited.framing);
      } else if (change.roadFar !== undefined || change.roadHorizon !== undefined)
        saveFraming(state);
    },
    viewProfileSelected(state, action: PayloadAction<Partial<ViewAxes>>) {
      selectProfile(state, action.payload);
    },
    viewFramingReset(state) {
      state.viewProfiles = saveViewFraming(state.viewProfiles, DEFAULT_VIEW_FRAMING);
      restoreFraming(state, DEFAULT_VIEW_FRAMING);
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
      if (mode === "piano") saveFraming(state);
    },
    layoutReset(state, action: PayloadAction<LayoutMode>) {
      state.layouts[action.payload] = DEFAULT_SCREEN_LAYOUTS[action.payload];
      if (action.payload === "piano") saveFraming(state);
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
    melodyOutputChanged(state, action: PayloadAction<MelodyOutputSettings>) {
      state.melodyOutput = action.payload;
    },
    instrumentProfilesChanged(state, action: PayloadAction<InstrumentProfilePreferences>) {
      const next = normalizeInstrumentProfilePreferences(action.payload);
      state.instrumentProfiles = {
        ...next,
        customProfiles: next.customProfiles.map((profile) => ({
          ...profile,
          instruments: profile.instruments.map((instrument) => ({ ...instrument }))
        }))
      };
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
