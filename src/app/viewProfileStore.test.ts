// @vitest-environment happy-dom
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { CAMERA_PRESETS } from "../render/worldCamera";
import { persistenceReducer } from "./persistenceSlice";
import {
  createPersistenceListener,
  loadPreferences,
  PREFERENCE_KEYS,
  registerPreferencePersistence,
  type PreferenceStorage
} from "./preferencePersistence";
import { preferencesActions as actions, preferencesReducer } from "./preferencesSlice";
import { DEFAULT_SCREEN_LAYOUTS } from "./screenLayout";
import {
  activeViewFraming,
  DEFAULT_VIEW_FRAMING,
  viewProfileKey,
  type ViewProfiles
} from "./viewProfiles";

function harness(records: Record<string, unknown> = {}) {
  const saved = new Map(
    Object.entries(records).map(([key, value]) => [key, JSON.stringify(value)])
  );
  const storage: PreferenceStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      saved.set(key, value);
    })
  };
  const loaded = loadPreferences(storage);
  const listener = createPersistenceListener();
  registerPreferencePersistence(listener, storage);
  const store = configureStore({
    reducer: { preferences: preferencesReducer, persistence: persistenceReducer },
    preloadedState: loaded,
    middleware: (defaults) => defaults().prepend(listener.middleware)
  });
  return { store, saved, storage, prefs: () => store.getState().preferences };
}

describe("atomic piano profile store", () => {
  it("hydrates legacy framing without storage writes and leaves typing and other keys alone", () => {
    const app = harness({
      [PREFERENCE_KEYS.staff]: { keyStyle: "3d", road: true, camera: CAMERA_PRESETS.hands },
      [PREFERENCE_KEYS.layouts]: {
        piano: { keysY: 94 },
        typing: { keysX: 112 },
        futureLayout: { value: 7 }
      },
      "lesson-private": { untouched: true }
    });
    expect(app.prefs().staff.camera).toEqual(CAMERA_PRESETS.hands);
    expect(app.prefs().layouts.piano.keysY).toBe(94);
    expect(app.prefs().layouts.typing.keysX).toBe(112);
    expect(app.storage.setItem).not.toHaveBeenCalled();
    app.store.dispatch(actions.staffChanged({ road: false }));
    app.store.dispatch(actions.layoutChanged({ mode: "piano", change: { keysY: 125 } }));
    expect(app.prefs().layouts.typing.keysX).toBe(112);
    expect(JSON.parse(app.saved.get(PREFERENCE_KEYS.layouts) ?? "null") as unknown).toMatchObject({
      futureLayout: { value: 7 }
    });
    expect(app.saved.get("lesson-private")).toBe('{"untouched":true}');
  });

  it("switches all framing atomically while musical settings, range and visibility stay global", () => {
    const app = harness();
    app.store.dispatch(actions.staffChanged({ keyStyle: "3d", road: true }));
    app.store.dispatch(
      actions.staffChanged({
        camera: CAMERA_PRESETS.hands,
        roadFar: 0.4,
        roadHorizon: 0.24,
        keyRange: "88",
        hands: true,
        fingers: false
      })
    );
    app.store.dispatch(
      actions.layoutChanged({
        mode: "piano",
        change: { keysY: 150, keysLift: 0.2, laneTop: 0.3, tickerScale: 1.7 }
      })
    );
    const saved = activeViewFraming(app.prefs().viewProfiles);
    const observed: unknown[] = [];
    const unsubscribe = app.store.subscribe(() => {
      const prefs = app.prefs();
      observed.push([prefs.staff.keyboardOrientation, prefs.staff.camera, prefs.layouts.piano]);
    });
    app.store.dispatch(actions.viewProfileSelected({ keyboardOrientation: "top" }));
    unsubscribe();
    expect(observed).not.toHaveLength(0);
    for (const value of observed)
      expect(value).toEqual(["top", DEFAULT_VIEW_FRAMING.camera, DEFAULT_VIEW_FRAMING.layout]);
    expect(app.prefs().staff).toMatchObject({ keyRange: "88", hands: true, fingers: false });
    const player = app.prefs().player;
    app.store.dispatch(actions.staffChanged({ camera: CAMERA_PRESETS.top }));
    app.store.dispatch(actions.staffChanged({ keyboardOrientation: "follow" }));
    expect(activeViewFraming(app.prefs().viewProfiles)).toEqual(saved);
    expect(app.prefs().player).toEqual(player);
    expect(app.prefs().layouts.typing).toEqual(DEFAULT_SCREEN_LAYOUTS.typing);
  });

  it("reloads the active profile and its remembered axes even when legacy framing is stale", () => {
    const app = harness();
    app.store.dispatch(
      actions.viewProfileSelected({ keyboardStyle: "3d", notesProjection: "perspective" })
    );
    app.store.dispatch(
      actions.staffChanged({ keyboardOrientation: "top", camera: CAMERA_PRESETS.hands })
    );
    app.store.dispatch(actions.layoutChanged({ mode: "piano", change: { keysX: 177 } }));
    app.saved.set(PREFERENCE_KEYS.staff, JSON.stringify({ keyStyle: "classic", road: false }));
    const loaded = loadPreferences(app.storage).preferences;
    expect(loaded.staff).toMatchObject({ keyStyle: "3d", road: true, keyboardOrientation: "top" });
    expect(loaded.staff.camera).toEqual(CAMERA_PRESETS.hands);
    expect(loaded.layouts.piano.keysX).toBe(177);
    expect(loaded.viewProfiles).toEqual(app.prefs().viewProfiles);
  });

  it("resets only the active framing and keeps camera reset separate from layout", () => {
    const app = harness();
    app.store.dispatch(actions.staffChanged({ camera: CAMERA_PRESETS.hands }));
    app.store.dispatch(actions.layoutChanged({ mode: "piano", change: { keysY: 190 } }));
    const oldKey = viewProfileKey(app.prefs().viewProfiles.active);
    const original = app.prefs().viewProfiles.entries[oldKey];
    app.store.dispatch(actions.staffChanged({ road: true }));
    app.store.dispatch(actions.layoutChanged({ mode: "piano", change: { keysY: -50 } }));
    app.store.dispatch(actions.staffChanged({ camera: CAMERA_PRESETS.top }));
    expect(app.prefs().layouts.piano.keysY).toBe(-50);
    app.store.dispatch(actions.viewFramingReset());
    expect(activeViewFraming(app.prefs().viewProfiles)).toEqual(DEFAULT_VIEW_FRAMING);
    expect(app.prefs().viewProfiles.entries[oldKey]).toEqual(original);
  });

  it("clears a migrated explicit staff share on reset and keeps it cleared after reload", () => {
    const app = harness({ [PREFERENCE_KEYS.layouts]: { piano: { staffShare: 0.63, keysY: 75 } } });
    app.store.dispatch(actions.layoutReset("piano"));
    expect(app.prefs().layouts.piano.staffShare).toBeUndefined();
    expect(loadPreferences(app.storage).preferences.layouts.piano.staffShare).toBeUndefined();
    expect(app.prefs().viewProfiles.legacySeed.layout.staffShare).toBe(0.63);
  });

  it("does not save global changes as framing and retains unknown profiles", () => {
    const initial = harness();
    const raw = {
      ...initial.prefs().viewProfiles,
      entries: { ...initial.prefs().viewProfiles.entries, "future:profile": { extra: [1, 2] } }
    };
    const app = harness({ [PREFERENCE_KEYS.viewProfiles]: raw });
    const initialProfiles = app.prefs().viewProfiles;
    app.store.dispatch(actions.staffChanged({ fps: true, visible: false, keyRange: "49" }));
    app.store.dispatch(actions.playerChanged({ speed: 0.75 }));
    expect(app.prefs().viewProfiles).toEqual(initialProfiles);
    app.store.dispatch(actions.staffChanged({ road: true }));
    const persisted = JSON.parse(
      app.saved.get(PREFERENCE_KEYS.viewProfiles) ?? "null"
    ) as ViewProfiles;
    expect(persisted.entries["future:profile"]).toEqual({ extra: [1, 2] });
    expect(persisted.legacySeed.camera).toEqual(DEFAULT_VIEW_FRAMING.camera);
  });
});
