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
import { DEFAULT_STAFF_PREFS, normalizeStaffPrefs } from "./staffPreferences";

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
  it("hydrates an empty installation as Classic, both devices, and automatic MIDI output", () => {
    const prefs = load();
    expect(prefs.staff.keyStyle).toBe("classic");
    expect(prefs.viewProfiles.active.keyboardStyle).toBe("classic");
    expect(prefs.staff.hands).toBe(false);
    expect(prefs.staff.road).toBe(false);
    expect(DEFAULT_STAFF_PREFS.keyStyle).toBe("classic");
    expect(normalizeStaffPrefs({ keyStyle: "bad" }).keyStyle).toBe("classic");
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

describe.each([false, true])(
  "initial view without replacing saved choices, coarse=%s",
  (coarse) => {
    beforeEach(() => {
      if (coarse) coarsePointer();
    });

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
      expect(load().staff.keyStyle).toBe("classic");
    });

    it.each(["classic", "arcade", "3d", "clay"])(
      "keeps modern saved %s over the default and legacy",
      (keyboardStyle) => {
        const prefs = load({
          [PREFERENCE_KEYS.viewProfiles]: JSON.stringify({
            version: 1,
            active: { keyboardStyle, notesProjection: "perspective", keyboardOrientation: "top" }
          }),
          [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle: "classic" })
        });
        expect(prefs.staff.keyStyle).toBe(keyboardStyle === "clay" ? "classic" : keyboardStyle);
        expect(prefs.viewProfiles.active.keyboardStyle).toBe(
          keyboardStyle === "clay" ? "classic" : keyboardStyle
        );
        expect(prefs.staff.road).toBe(true);
        expect(prefs.staff.keyboardOrientation).toBe(keyboardStyle === "3d" ? "top" : "follow");
      }
    );

    it.each(["classic", "arcade", "3d", "clay", "perspective"])(
      "keeps legacy saved %s",
      (keyStyle) => {
        const prefs = load({
          [PREFERENCE_KEYS.staff]: JSON.stringify({ keyStyle, camera: { fov: 60 }, road: true })
        });
        expect(prefs.staff.keyStyle).toBe(
          keyStyle === "perspective" ? "3d" : keyStyle === "clay" ? "classic" : keyStyle
        );
        expect(prefs.staff.camera.fov).toBe(60);
        expect(prefs.staff.road).toBe(true);
      }
    );

    it("uses Classic for invalid saved choices without discarding other saved preferences", () => {
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

    it("persists a manual switch from Classic to 3D and restores it on reload", () => {
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
  }
);

it("restores a removed saved clay choice as classic without erasing archived profiles", () => {
  const archived = {
    camera: { height: 960 },
    layout: { keysY: 41 },
    retainedMarker: "clay-source"
  };
  const values: Record<string, string> = {
    [PREFERENCE_KEYS.staff]: JSON.stringify({
      keyStyle: "clay",
      keyboardOrientation: "top",
      octaveLabels: false
    }),
    [PREFERENCE_KEYS.viewProfiles]: JSON.stringify({
      version: 1,
      active: { keyboardStyle: "clay", keyboardOrientation: "top", notesProjection: "perspective" },
      entries: {
        "clay:perspective:top": archived,
        "classic:perspective:follow": { camera: { height: 720 }, layout: { keysY: 77 } }
      }
    })
  };
  const original = { ...values };
  const storage = {
    getItem: (key: string) => values[key] ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values[key] = value;
    })
  };
  const initial = loadPreferences(storage);
  expect(initial.preferences.staff).toMatchObject({
    keyStyle: "classic",
    keyboardOrientation: "follow",
    road: true,
    octaveLabels: false,
    camera: { height: 720 }
  });
  expect(initial.preferences.layouts.piano.keysY).toBe(77);
  expect(initial.preferences.viewProfiles.entries["clay:perspective:top"]).toEqual(archived);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values).toEqual(original);
  const listener = createPersistenceListener();
  registerPreferencePersistence(listener, storage);
  const store = configureStore({
    reducer: { preferences: preferencesReducer, persistence: persistenceReducer },
    preloadedState: initial,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
  });
  store.dispatch(preferencesActions.staffChanged({ octaveLabels: true }));
  const restored = loadPreferences(storage).preferences;
  expect(restored.staff).toMatchObject({
    keyStyle: "classic",
    octaveLabels: true,
    camera: { height: 720 }
  });
  expect(restored.viewProfiles.active).toEqual(initial.preferences.viewProfiles.active);
  expect(restored.viewProfiles.entries["clay:perspective:top"]).toEqual(archived);
});
