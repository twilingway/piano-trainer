// @vitest-environment happy-dom
import { withTestStore } from "./storeTestSupport";
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
    root.render(withTestStore(createElement(Harness)));
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

describe("FPS preference", () => {
  it("starts disabled and ignores invalid saved values", async () => {
    localStorage.setItem("staff-prefs", JSON.stringify({ fps: "true" }));
    await mount();
    expect(prefs.staffPrefs.fps).toBe(false);
  });

  it("preserves the toggle after a reload", async () => {
    await mount();
    expect(prefs.staffPrefs.fps).toBe(false);
    await act(async () => {
      prefs.updateStaffPrefs({ fps: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.fps).toBe(true);
    await act(async () => {
      prefs.updateStaffPrefs({ fps: false });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({ fps: false });
  });
});

describe("hand style preference", () => {
  it.each([undefined, "photo", 3])(
    "reads a missing or unknown saved style %s as 3D",
    async (handStyle) => {
      localStorage.setItem("staff-prefs", JSON.stringify({ handStyle, labels: true }));
      await mount();
      expect(prefs.staffPrefs.handStyle).toBe("rendered");
      expect(prefs.staffPrefs.labels).toBe(true);
    }
  );

  it("keeps the drawn style across a reload", async () => {
    localStorage.setItem("staff-prefs", JSON.stringify({ handStyle: "drawn" }));
    await mount();
    expect(prefs.staffPrefs.handStyle).toBe("drawn");
  });
});

describe("falling note defaults", () => {
  it.each([null, { road: false }])(
    "starts with plain falling notes for saved prefs %j",
    async (saved) => {
      if (saved) localStorage.setItem("staff-prefs", JSON.stringify(saved));
      await mount();
      expect(prefs.staffPrefs).toMatchObject({ lane: true, road: false, noteCards: false });
      await act(async () => {
        prefs.updateStaffPrefs({ road: true });
        await Promise.resolve();
      });
      await act(async () => {
        prefs.updateStaffPrefs({ road: false });
        await Promise.resolve();
      });
      expect(prefs.staffPrefs.noteCards).toBe(false);
    }
  );

  it("preserves explicitly saved views", async () => {
    localStorage.setItem(
      "staff-prefs",
      JSON.stringify({ lane: false, road: true, noteCards: true })
    );
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ lane: false, road: true, noteCards: true });
  });
});
