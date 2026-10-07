// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
let store: AppStore | undefined;
import { useGameOptions } from "./useGameOptions";

let host: HTMLDivElement;
let root: Root;
let state: ReturnType<typeof useGameOptions>;
const KEYS = { low: 48, high: 72 };
function Harness({
  practiceOnly = false,
  playable
}: {
  practiceOnly?: boolean;
  playable?: typeof KEYS;
}) {
  const options = useGameOptions("song", 10, practiceOnly, playable);
  useEffect(() => {
    state = options;
  });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  store = undefined;
  host = document.createElement("div");
  root = createRoot(host);
  store = undefined;
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  vi.unstubAllGlobals();
});
describe("educational timing preference", () => {
  it("enables training by default and migrates older settings", async () => {
    localStorage.setItem("game-options-v1", JSON.stringify({ difficulty: "hard" }));
    await act(async () => {
      root.render(withTestStore(<Harness />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    expect(state.learningWindow).toBe(true);
    expect(state.options).toMatchObject({ difficulty: "hard", learningWindow: true });
    await act(async () => {
      state.update({ learningWindow: false });
      await Promise.resolve();
    });
    const stored: unknown = JSON.parse(localStorage.getItem("game-options-v1") ?? "{}");
    expect(stored).toMatchObject({ learningWindow: false });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    store = undefined;
    await act(async () => {
      root.render(withTestStore(<Harness />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    expect(state.options.learningWindow).toBe(false);
  });
  it("forces strict ranked windows without changing saved learning preference", async () => {
    await act(async () => {
      root.render(withTestStore(<Harness />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    await act(async () => {
      state.update({ ranked: true });
      await Promise.resolve();
    });
    expect(state.learningWindow).toBe(true);
    expect(state.options.learningWindow).toBe(false);
    await act(async () => {
      root.render(withTestStore(<Harness practiceOnly />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    expect(state.ranked).toBe(false);
    expect(state.options.learningWindow).toBe(true);
  });
});

describe("the player's keyboard", () => {
  it("limits a practice run, but neither Ranked nor the word mode", async () => {
    await act(async () => {
      root.render(withTestStore(<Harness playable={KEYS} />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    expect(state.options.playable).toBe(KEYS);
    await act(async () => {
      root.render(
        withTestStore(<Harness playable={KEYS} practiceOnly />, (store ??= createAppStore()))
      );
      await Promise.resolve();
    });
    expect(state.options.playable).toBeUndefined();
    localStorage.setItem("game-options-v1", JSON.stringify({ ranked: true }));
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    store = undefined;
    await act(async () => {
      root.render(withTestStore(<Harness playable={KEYS} />, (store ??= createAppStore())));
      await Promise.resolve();
    });
    expect(state.ranked).toBe(true);
    expect(state.options.playable).toBeUndefined();
  });
});
