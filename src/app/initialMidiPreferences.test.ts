// @vitest-environment happy-dom
import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_OUTPUT_CHOICE } from "../input/midiOutput";
import {
  createPersistenceListener,
  loadPreferences,
  PREFERENCE_KEYS,
  registerPreferencePersistence
} from "./preferencePersistence";
import { preferencesActions, preferencesReducer } from "./preferencesSlice";
import { persistenceReducer } from "./persistenceSlice";

const load = (values: Record<string, string> = {}) =>
  loadPreferences({ getItem: (key) => values[key] ?? null, setItem: () => undefined }).preferences;

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const coarsePointer = () =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)"
  }));

describe("new piano defaults", () => {
  it("hydrates an empty installation as 3D, both devices, and automatic MIDI output", () => {
    const prefs = load();
    expect(prefs.staff.keyStyle).toBe("3d");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("3d");
    expect(prefs.melodyOutput).toEqual({ mode: "both", channel: 1 });
    expect(prefs.midiOutput).toEqual(AUTO_OUTPUT_CHOICE);
    expect(prefs.instrumentProfiles.profileId).toBe("grace-bp-300");
    expect(prefs.instrumentProfiles.instrumentId).toBeNull();
  });

  it("keeps an existing view, camera, browser route, and explicitly disabled MIDI", () => {
    const prefs = load({
      [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle: "arcade", camera: { fov: 60 } }),
      [PREFERENCE_KEYS.melodyOutput]: JSON.stringify({ mode: "browser", channel: 2 }),
      [PREFERENCE_KEYS.midiOutput]: "null"
    });
    expect(prefs.staff.keyStyle).toBe("arcade");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("arcade");
    expect(prefs.staff.camera.fov).toBe(60);
    expect(prefs.melodyOutput).toEqual({ mode: "browser", channel: 2 });
    expect(prefs.midiOutput).toBeNull();
  });
});

describe("mobile initial view without replacing saved choices", () => {
  it("starts in Classic on a coarse primary pointer even on a wide tablet viewport", () => {
    coarsePointer();
    vi.stubGlobal("innerWidth", 1280);
    vi.stubGlobal("innerHeight", 800);
    const prefs = load();
    expect(prefs.staff.keyStyle).toBe("classic");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("classic");
    expect(prefs.staff.road).toBe(false);
    expect(prefs.staff.visible).toBe(true);
  });

  it("keeps the desktop default when media-query detection is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(load().staff.keyStyle).toBe("3d");
  });

  it.each(["classic", "arcade", "3d"])(
    "keeps modern saved %s over the mobile default and legacy",
    (keyboardStyle) => {
      coarsePointer();
      const prefs = load({
        [PREFERENCE_KEYS.viewProfiles]: JSON.stringify({
          version: 1,
          active: { keyboardStyle, notesProjection: "perspective", keyboardOrientation: "top" }
        }),
        [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle: "classic" })
      });
      expect(prefs.staff.keyStyle).toBe(keyboardStyle);
      expect(prefs.viewProfiles.active.keyboardStyle).toBe(keyboardStyle);
      expect(prefs.staff.road).toBe(true);
      expect(prefs.staff.keyboardOrientation).toBe(keyboardStyle === "3d" ? "top" : "follow");
    }
  );

  it.each(["classic", "arcade", "3d", "perspective"])(
    "keeps legacy saved %s on coarse input",
    (keyStyle) => {
      coarsePointer();
      const prefs = load({
        [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle, camera: { fov: 60 }, road: true })
      });
      expect(prefs.staff.keyStyle).toBe(keyStyle === "perspective" ? "3d" : keyStyle);
      expect(prefs.staff.camera.fov).toBe(60);
      expect(prefs.staff.road).toBe(true);
    }
  );

  it("uses Classic for invalid saved choices without discarding other saved preferences", () => {
    coarsePointer();
    const prefs = load({
      [PREFERENCE_KEYS.viewProfiles]: JSON.stringify({
        version: 1,
        active: { keyboardStyle: "bad" }
      }),
      [PREFERENCE_KEYS.staff]: JSON.stringify({
        keyStyle: "bad",
        camera: { fov: 60 },
        octaveLabels: false
      })
    });
    expect(prefs.staff.keyStyle).toBe("classic");
    expect(prefs.staff.camera.fov).toBe(60);
    expect(prefs.staff.octaveLabels).toBe(false);
  });

  it("persists a manual switch from the mobile default to 3D and restores it on reload", () => {
    coarsePointer();
    const values: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      }
    };
    const initial = loadPreferences(storage);
    expect(initial.preferences.staff.keyStyle).toBe("classic");
    const listener = createPersistenceListener();
    registerPreferencePersistence(listener, storage);
    const store = configureStore({
      reducer: { preferences: preferencesReducer, persistence: persistenceReducer },
      preloadedState: initial,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
    });
    store.dispatch(preferencesActions.staffChanged({ keyStyle: "3d" }));
    const reloaded = loadPreferences(storage).preferences;
    expect(reloaded.staff.keyStyle).toBe("3d");
    expect(reloaded.viewProfiles.active.keyboardStyle).toBe("3d");
  });
});
