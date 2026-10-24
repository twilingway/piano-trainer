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
    app.store.dispatch(actions.staffChanged({ keyboardOrientation: "follow" }));
    expect(activeViewFraming(app.prefs().viewProfiles)).toEqual(saved);
    expect(app.prefs().player).toEqual(player);
    expect(app.prefs().layouts.typing).toEqual(DEFAULT_SCREEN_LAYOUTS.typing);
  });

  it("reloads the active profile and its remembered axes even when legacy framing is stale", () => {
    const app = harness({
      [PREFERENCE_KEYS.staff]: {
        keyStyle: "3d",
        road: true,
        keyboardOrientation: "top",
        camera: CAMERA_PRESETS.hands
      }
    });
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

it("keeps the exact keyboard framing through projection switches and reload", () => {
  const camera = { ...CAMERA_PRESETS.top, height: 930, targetY: -125, scale: 1.1 };
  const app = harness({
    [PREFERENCE_KEYS.staff]: {
      keyStyle: "3d",
      road: true,
      camera,
      keyboardOrientation: "top",
      keyRange: "88"
    },
    [PREFERENCE_KEYS.layouts]: {
      piano: {
        staffShare: 0.6,
        laneTop: 0.2,
        keysLift: 0.1,
        keysScale: 1.4,
        keysX: 80,
        keysY: 63,
        tickerGap: 27
      }
    }
  });
  const layout = app.prefs().layouts.piano;
  const player = app.prefs().player;
  const observations: unknown[] = [];
  const unsubscribe = app.store.subscribe(() => {
    observations.push([
      app.prefs().staff.camera,
      app.prefs().staff.keyboardOrientation,
      app.prefs().layouts.piano
    ]);
  });
  app.store.dispatch(actions.staffChanged({ road: false }));
  const direct = activeViewFraming(app.prefs().viewProfiles);
  app.store.dispatch(actions.staffChanged({ road: true }));
  unsubscribe();
  expect(app.prefs().staff).toMatchObject({
    road: true,
    keyStyle: "3d",
    keyRange: "88",
    keyboardOrientation: "top",
    camera
  });
  expect(observations.length).toBeGreaterThan(0);
  for (const value of observations) expect(value).toEqual([camera, "top", layout]);
  expect(app.prefs().player).toEqual(player);
  const reloaded = loadPreferences(app.storage).preferences;
  expect(reloaded.staff.camera).toEqual(app.prefs().staff.camera);
  expect(reloaded.staff.keyboardOrientation).toBe("top");
  expect(reloaded.layouts.piano).toEqual(layout);
  app.store.dispatch(actions.staffChanged({ road: false }));
  expect(activeViewFraming(app.prefs().viewProfiles)).toEqual(direct);
});

it("applies camera edits and clears top atomically while retaining layout and road shape", () => {
  const app = harness({
    [PREFERENCE_KEYS.staff]: {
      keyStyle: "3d",
      road: true,
      keyboardOrientation: "top",
      camera: CAMERA_PRESETS.hands,
      roadFar: 0.4,
      roadHorizon: 0.23
    },
    [PREFERENCE_KEYS.layouts]: {
      piano: { staffShare: 0.58, laneTop: 0.3, keysScale: 1.4, keysY: 75 }
    }
  });
  const before = activeViewFraming(app.prefs().viewProfiles);
  const camera = { ...CAMERA_PRESETS.player, scale: 1.25, targetY: 51 };
  const observations: unknown[] = [];
  const unsubscribe = app.store.subscribe(() => {
    observations.push([
      app.prefs().staff.keyboardOrientation,
      app.prefs().staff.camera,
      app.prefs().layouts.piano
    ]);
  });
  app.store.dispatch(actions.staffChanged({ camera }));
  unsubscribe();
  expect(observations.length).toBeGreaterThan(0);
  for (const value of observations) expect(value).toEqual(["follow", camera, before.layout]);
  expect(activeViewFraming(app.prefs().viewProfiles)).toEqual({ ...before, camera });
  expect(loadPreferences(app.storage).preferences.staff).toMatchObject({
    camera,
    keyboardOrientation: "follow"
  });
  app.store.dispatch(actions.staffChanged({ keyboardOrientation: "top" }));
  expect(activeViewFraming(app.prefs().viewProfiles)).toEqual(before);
});

it("hydrates the initial top camera without writing over existing preferences", () => {
  const app = harness({ [PREFERENCE_KEYS.staff]: { hands: true, labels: true } });
  expect(app.prefs().staff).toMatchObject({
    keyStyle: "3d",
    keyboardOrientation: "follow",
    camera: CAMERA_PRESETS.top,
    hands: true,
    labels: true
  });
  expect(app.prefs().viewProfiles.legacySeed.camera).toEqual(CAMERA_PRESETS.top);
  expect(app.storage.setItem).not.toHaveBeenCalled();
});

it("keeps migrated v1 framing through a persisted edit and reload", () => {
  const camera = { ...CAMERA_PRESETS.hands, scale: 1.2 };
  const entry = { ...DEFAULT_VIEW_FRAMING, camera };
  const app = harness({
    [PREFERENCE_KEYS.staff]: { keyStyle: "perspective", hands: true },
    [PREFERENCE_KEYS.viewProfiles]: {
      version: 1,
      active: {
        keyboardStyle: "perspective",
        notesProjection: "perspective",
        keyboardOrientation: "follow"
      },
      legacySeed: DEFAULT_VIEW_FRAMING,
      entries: { "perspective:perspective:follow": entry }
    }
  });
  expect(app.prefs().staff).toMatchObject({ keyStyle: "3d", road: true, camera, hands: true });
  app.store.dispatch(actions.staffChanged({ roadGuides: true }));
  const reloaded = loadPreferences(app.storage).preferences;
  expect(reloaded.staff).toMatchObject({
    keyStyle: "3d",
    road: true,
    camera,
    hands: true,
    roadGuides: true
  });
  expect(reloaded.viewProfiles.entries["perspective:perspective:follow"]).toEqual(entry);
});
