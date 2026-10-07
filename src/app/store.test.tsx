// @vitest-environment happy-dom
import { act, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "./store";
import { preferencesActions } from "./preferencesSlice";
import { persistenceErrorChanged } from "./persistenceSlice";
import { persistenceKey, type PreferenceStorage } from "./preferencePersistence";
import { useAppSelector, usePreferenceState } from "./storeHooks";
import { withTestStore } from "./storeTestSupport";
import type { RootState } from "./store";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("application preferences", () => {
  it("hydrates legacy keys without any startup writes", () => {
    localStorage.setItem(
      "player-prefs",
      JSON.stringify({ speed: 0.4, mode: "tempo", metronome: false })
    );
    localStorage.setItem("staff-prefs", JSON.stringify({ labels: true, zoom: 1.3 }));
    localStorage.setItem("screen-layout", JSON.stringify({ typing: { keysX: 112 } }));
    localStorage.setItem("fullscreen-preferred", "false");
    const write = vi.spyOn(localStorage, "setItem");
    const store = createAppStore();
    expect(store.getState().preferences).toMatchObject({
      player: { speed: 0.4, mode: "tempo", metronome: false },
      staff: { labels: true, zoom: 1.3 },
      layouts: { typing: { keysX: 112 } },
      fullscreen: false
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("validates damaged fields, enums and finite numbers", () => {
    localStorage.setItem(
      "staff-prefs",
      JSON.stringify({ keys: "false", zoom: null, keyStyle: "bad", camera: { fov: null } })
    );
    localStorage.setItem(
      "player-prefs",
      JSON.stringify({ speed: "0.2", handChoice: "bad", metronome: "false" })
    );
    localStorage.setItem(
      "key-lights-v1",
      JSON.stringify({ enabled: "true", channel: 99, velocity: -1 })
    );
    localStorage.setItem("word-typing-prefs-v1", "broken json");
    const state = createAppStore().getState();
    expect(state.preferences.staff).toMatchObject({
      keys: true,
      zoom: 1,
      keyStyle: "arcade",
      camera: { fov: 43 }
    });
    expect(state.preferences.player).toMatchObject({
      speed: 0.75,
      handChoice: "right",
      metronome: true
    });
    expect(state.preferences.keyLights.enabled).toBe(false);
    expect(state.persistence.errors[persistenceKey("word-typing-prefs-v1", "read")]).toBe(
      "invalid"
    );
  });

  it("persists only changed projections and retains consecutive patches", () => {
    const store = createAppStore();
    const write = vi.spyOn(localStorage, "setItem");
    store.dispatch(preferencesActions.staffChanged({ labels: true }));
    store.dispatch(preferencesActions.staffChanged({ fps: true }));
    store.dispatch(preferencesActions.staffChanged({ fps: true }));
    expect(write.mock.calls.map(([key]) => key)).toEqual(["staff-prefs", "staff-prefs"]);
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "null")).toMatchObject({
      labels: true,
      fps: true
    });
    const reloaded = createAppStore();
    expect(reloaded.getState().preferences.staff).toMatchObject({ labels: true, fps: true });
  });

  it("retains independent errors and keeps working when writes fail", () => {
    let fail = true;
    const storage: PreferenceStorage = {
      getItem: () => null,
      setItem: (key) => {
        if (key === "staff-prefs" && fail) throw new DOMException("Full", "QuotaExceededError");
      }
    };
    const store = createAppStore({ storage });
    store.dispatch(preferencesActions.staffChanged({ fps: true }));
    store.dispatch(persistenceErrorChanged({ key: "indexedDB:songs:write", error: "aborted" }));
    store.dispatch(preferencesActions.fullscreenChanged(false));
    expect(store.getState().persistence.errors).toEqual({
      [persistenceKey("staff-prefs", "write")]: "unavailable",
      "indexedDB:songs:write": "aborted"
    });
    expect(store.getState().preferences.staff.fps).toBe(true);
    fail = false;
    store.dispatch(preferencesActions.staffChanged({ fps: false }));
    expect(store.getState().persistence.errors).toEqual({ "indexedDB:songs:write": "aborted" });
  });

  it("tolerates read access denied and keeps an error per operation", () => {
    const store = createAppStore({
      storage: {
        getItem: () => {
          throw new DOMException("Denied", "SecurityError");
        },
        setItem: () => undefined
      }
    });
    expect(store.getState().preferences.staff.labels).toBe(false);
    expect(store.getState().persistence.errors[persistenceKey("staff-prefs", "read")]).toBe(
      "unavailable"
    );
    store.dispatch(preferencesActions.staffChanged({ labels: true }));
    expect(store.getState().persistence.errors[persistenceKey("staff-prefs", "read")]).toBe(
      "unavailable"
    );
  });

  it("keeps stores independent and narrow selectors quiet on unrelated changes", async () => {
    const first = createAppStore(),
      second = createAppStore();
    const host = document.createElement("div"),
      root = createRoot(host);
    let renders = 0;
    function Harness() {
      useAppSelector((state) => state.preferences.staff.fps);
      renders++;
      return null;
    }
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness />, first));
    });
    const initial = renders;
    await act(async () => {
      await Promise.resolve();
      first.dispatch(preferencesActions.fullscreenChanged(false));
    });
    expect(renders).toBe(initial);
    await act(async () => {
      await Promise.resolve();
      first.dispatch(preferencesActions.staffChanged({ fps: true }));
    });
    expect(renders).toBe(initial + 1);
    expect(second.getState().preferences.staff.fps).toBe(false);
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
  });

  it("materializes functional updates from current state before dispatch", async () => {
    const store = createAppStore(),
      root = createRoot(document.createElement("div"));
    const selector = (state: RootState) => state.preferences.timing;
    let update: (value: SetStateAction<RootState["preferences"]["timing"]>) => void;
    function Harness() {
      [, update] = usePreferenceState(selector, preferencesActions.timingChanged);
      return null;
    }
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness />, store));
    });
    await act(async () => {
      await Promise.resolve();
      update((previous) => ({ ...previous, manualOffsetMs: 12 }));
      update((previous) => ({ ...previous, visualOffsetMs: 23 }));
    });
    expect(store.getState().preferences.timing).toMatchObject({
      manualOffsetMs: 12,
      visualOffsetMs: 23
    });
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
  });
});
