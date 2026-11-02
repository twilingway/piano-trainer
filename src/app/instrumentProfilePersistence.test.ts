// @vitest-environment happy-dom
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { AUTO_OUTPUT_CHOICE } from "../input/midiOutput";
import { GRACE_BP300 } from "../input/instrumentProfiles";
import { preferencesActions, preferencesReducer } from "./preferencesSlice";
import { persistenceReducer } from "./persistenceSlice";
import {
  createPersistenceListener,
  loadPreferences,
  PREFERENCE_KEYS,
  registerPreferencePersistence,
  type PreferenceStorage
} from "./preferencePersistence";

function harness(initial: Record<string, string> = {}) {
  const saved = new Map(Object.entries(initial));
  const storage: PreferenceStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      saved.set(key, value);
    })
  };
  const listener = createPersistenceListener();
  registerPreferencePersistence(listener, storage);
  const store = configureStore({
    reducer: { preferences: preferencesReducer, persistence: persistenceReducer },
    preloadedState: loadPreferences(storage),
    middleware: (defaults) => defaults().prepend(listener.middleware)
  });
  return { saved, storage, store };
}

describe("instrument profile persistence", () => {
  it("persists profile names and selection without altering unrelated preferences", () => {
    const app = harness({ [PREFERENCE_KEYS.midiOutput]: "null" });
    const before = app.store.getState().preferences;
    app.store.dispatch(
      preferencesActions.instrumentProfilesChanged({
        customProfiles: [],
        profileId: GRACE_BP300.id,
        instrumentId: "voice-075",
        graceName: "My Grace"
      })
    );
    const loaded = loadPreferences(app.storage).preferences;
    expect(loaded.instrumentProfiles).toEqual({
      customProfiles: [],
      profileId: GRACE_BP300.id,
      instrumentId: "voice-075",
      graceName: "My Grace"
    });
    expect(loaded.midiOutput).toBeNull();
    expect(app.store.getState().preferences.player).toBe(before.player);
    expect(app.store.getState().preferences.staff).toBe(before.staff);
    expect(app.storage.setItem).toHaveBeenCalledExactlyOnceWith(
      PREFERENCE_KEYS.instrumentProfiles,
      JSON.stringify(loaded.instrumentProfiles)
    );
  });

  it("preserves an explicit unselected piano across a reload", () => {
    const app = harness();
    app.store.dispatch(
      preferencesActions.instrumentProfilesChanged({
        customProfiles: [],
        profileId: null,
        instrumentId: "voice-075"
      })
    );
    expect(loadPreferences(app.storage).preferences.instrumentProfiles).toEqual({
      customProfiles: [],
      profileId: null,
      instrumentId: null
    });
  });

  it("does not persist malformed profile records and recovers a corrupt saved payload", () => {
    const app = harness({ [PREFERENCE_KEYS.instrumentProfiles]: "{" });
    expect(app.store.getState().preferences.instrumentProfiles).toMatchObject({
      profileId: GRACE_BP300.id,
      instrumentId: null,
      customProfiles: []
    });
    expect(app.store.getState().persistence.errors).toMatchObject({
      [`localStorage:${PREFERENCE_KEYS.instrumentProfiles}:read`]: "invalid"
    });
  });
});

describe("missing MIDI output migration", () => {
  it("defaults to Auto only when no output choice was saved", () => {
    expect(loadPreferences(harness().storage).preferences.midiOutput).toEqual(AUTO_OUTPUT_CHOICE);
  });

  it.each(["null", "{", "{}", '"Piano"', '{"id":4,"name":"Piano"}'])(
    "preserves safe None for explicit or corrupt saved output %s",
    (raw) => {
      const app = harness({ [PREFERENCE_KEYS.midiOutput]: raw });
      expect(loadPreferences(app.storage).preferences.midiOutput).toBeNull();
    }
  );

  it("preserves a manual output and an already stored Auto choice", () => {
    for (const output of [{ id: "manual", name: "Manual piano" }, AUTO_OUTPUT_CHOICE]) {
      const app = harness({ [PREFERENCE_KEYS.midiOutput]: JSON.stringify(output) });
      expect(loadPreferences(app.storage).preferences.midiOutput).toEqual(output);
    }
  });

  it("keeps None when output storage is inaccessible rather than treating failure as absence", () => {
    const storage: PreferenceStorage = {
      getItem: (key) => {
        if (key === PREFERENCE_KEYS.midiOutput) throw new Error("Storage blocked");
        return null;
      },
      setItem: vi.fn()
    };
    const loaded = loadPreferences(storage);
    expect(loaded.preferences.midiOutput).toBeNull();
    expect(loaded.persistence.errors).toMatchObject({
      [`localStorage:${PREFERENCE_KEYS.midiOutput}:read`]: "unavailable"
    });
  });
});
