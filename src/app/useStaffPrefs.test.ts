// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStaffPrefs } from "./useStaffPrefs";

let root: Root;
let host: HTMLDivElement;
let prefs: ReturnType<typeof useStaffPrefs>;

function Harness() {
  const current = useStaffPrefs();
  useLayoutEffect(() => {
    prefs = current;
  });
  return null;
}

async function mount() {
  await act(async () => {
    root.render(createElement(Harness));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("key sticker preference", () => {
  it.each([false, true])("starts without stickers when mobile is %s", async (mobile) => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: mobile } as MediaQueryList);
    await mount();
    expect(prefs.staffPrefs.labels).toBe(false);
  });

  it.each([false, true])("preserves saved labels=%s", async (labels) => {
    localStorage.setItem("staff-prefs", JSON.stringify({ labels }));
    await mount();
    expect(prefs.staffPrefs.labels).toBe(labels);
  });

  it("keeps an explicit toggle after remount", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({ labels: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.labels).toBe(true);
    await act(async () => {
      prefs.updateStaffPrefs({ labels: false });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      labels: false
    });
  });
});
