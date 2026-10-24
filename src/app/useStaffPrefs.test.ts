// @vitest-environment happy-dom
import { withTestStore } from "./storeTestSupport";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_PRESETS, DEFAULT_CAMERA } from "../render/worldCamera";
import { normalizeStaffPrefs } from "./staffPreferences";
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

describe("local pianist choice", () => {
  it.each([undefined, "true", 1, null])(
    "keeps the pianist off for missing or invalid saved value %s",
    async (pianist) => {
      localStorage.setItem("staff-prefs", JSON.stringify({ keyStyle: "3d", pianist }));
      await mount();
      expect(prefs.staffPrefs.pianist).toBe(false);
    }
  );

  it("keeps the pianist on through a reload", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({ pianist: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.pianist).toBe(true);
  });
});

describe("falling note defaults", () => {
  it.each([undefined, "true", 1, null])(
    "keeps road guides off for missing or invalid saved value %s",
    async (roadGuides) => {
      localStorage.setItem("staff-prefs", JSON.stringify({ keyStyle: "3d", roadGuides }));
      await mount();
      expect(prefs.staffPrefs.roadGuides).toBe(false);
    }
  );

  it("preserves an explicit road guide choice through reload and later disabling", async () => {
    await mount();
    expect(prefs.staffPrefs.roadGuides).toBe(false);
    await act(async () => {
      prefs.updateStaffPrefs({ roadGuides: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.roadGuides).toBe(true);
    await act(async () => {
      prefs.updateStaffPrefs({ roadGuides: false });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      roadGuides: false
    });
  });

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

  it("keeps the 3D key style across a reload", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({ keyStyle: "3d", road: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ keyStyle: "3d", road: true });
  });
});

describe("inspection camera preference", () => {
  it.each([undefined, "true", 1, null])("rejects invalid saved value %s", async (freeCamera) => {
    localStorage.setItem("staff-prefs", JSON.stringify({ keyStyle: "3d", freeCamera }));
    await mount();
    expect(prefs.staffPrefs.freeCamera).toBe(false);
  });

  it("keeps the mode through reload without storing orbit coordinates", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({ freeCamera: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.freeCamera).toBe(true);
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      freeCamera: true
    });
  });
});

describe("performance scene preference", () => {
  it.each([undefined, "true", 1, null])(
    "rejects invalid saved value %s",
    async (performanceScene) => {
      localStorage.setItem("staff-prefs", JSON.stringify({ performanceScene }));
      await mount();
      expect(prefs.staffPrefs.performanceScene).toBe(false);
    }
  );
  it("restores scene mode without overwriting the saved camera", async () => {
    await mount();
    const camera = prefs.staffPrefs.camera;
    await act(async () => {
      prefs.updateStaffPrefs({ performanceScene: true });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.performanceScene).toBe(true);
    expect(prefs.staffPrefs.camera).toEqual(camera);
  });
});

describe("flat keyboard effect preferences", () => {
  it("keeps old appearance by default and rejects malformed stored toggles", async () => {
    localStorage.setItem(
      "staff-prefs",
      JSON.stringify({ flatNoteBurning: "false", flatPressEffects: 0 })
    );
    await mount();
    expect(prefs.staffPrefs.flatNoteBurning).toBe(true);
    expect(prefs.staffPrefs.flatPressEffects).toBe(true);
  });

  it("persists independent toggles across style changes and reloads", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({
        keyStyle: "classic",
        flatNoteBurning: false,
        flatPressEffects: true
      });
      await Promise.resolve();
    });
    await act(async () => {
      prefs.updateStaffPrefs({ keyStyle: "arcade", flatPressEffects: false });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs.flatNoteBurning).toBe(false);
    expect(prefs.staffPrefs.flatPressEffects).toBe(false);
    await act(async () => {
      prefs.updateStaffPrefs({ flatNoteBurning: true });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      flatNoteBurning: true,
      flatPressEffects: false
    });
  });
});

describe("initial unified keyboard preferences", () => {
  it.each([undefined, {}, { labels: true }])(
    "starts with 3D, full top camera and hidden hands: %j",
    (saved) => {
      expect(normalizeStaffPrefs(saved)).toMatchObject({
        keyStyle: "3d",
        camera: CAMERA_PRESETS.top,
        hands: false,
        keyboardOrientation: "follow"
      });
    }
  );

  it.each(["classic", "arcade", "3d"] as const)(
    "keeps saved %s, hands and camera",
    async (keyStyle) => {
      localStorage.setItem(
        "staff-prefs",
        JSON.stringify({ keyStyle, hands: true, camera: CAMERA_PRESETS.hands })
      );
      await mount();
      expect(prefs.staffPrefs).toMatchObject({
        keyStyle,
        hands: true,
        camera: CAMERA_PRESETS.hands
      });
    }
  );

  it("normalizes the old perspective style while preserving the saved partial camera", async () => {
    const saved = { keyStyle: "perspective", hands: true, road: true, camera: { fov: 60 } };
    expect(normalizeStaffPrefs(saved)).toMatchObject({
      keyStyle: "3d",
      hands: true,
      road: true,
      camera: { ...DEFAULT_CAMERA, fov: 60 }
    });
    localStorage.setItem("staff-prefs", JSON.stringify(saved));
    await mount();
    expect(prefs.staffPrefs).toMatchObject({
      keyStyle: "3d",
      hands: true,
      road: true,
      camera: { ...DEFAULT_CAMERA, fov: 60 }
    });
  });

  it("hydrates the top preset through the store when no camera was saved", async () => {
    await mount();
    expect(prefs.staffPrefs).toMatchObject({
      keyStyle: "3d",
      hands: false,
      camera: CAMERA_PRESETS.top,
      keyboardOrientation: "follow"
    });
  });
});

describe("notation color preferences", () => {
  it("starts with white notes and a green played note", () => {
    expect(normalizeStaffPrefs(null)).toMatchObject({
      noteColor: "#ffffff",
      playedNoteColor: "#00df50"
    });
  });

  it.each([undefined, null, "red", "#12", "#ffffff00", 123])(
    "repairs an invalid played color %j while keeping the saved note color",
    (playedNoteColor) => {
      expect(normalizeStaffPrefs({ noteColor: "#Ab12Cd", playedNoteColor })).toMatchObject({
        noteColor: "#Ab12Cd",
        playedNoteColor: "#00df50"
      });
    }
  );

  it("repairs an invalid base note color independently", () => {
    expect(normalizeStaffPrefs({ noteColor: "blue", playedNoteColor: "#123456" })).toMatchObject({
      noteColor: "#ffffff",
      playedNoteColor: "#123456"
    });
  });

  it("persists both color choices through a reload", async () => {
    localStorage.setItem("staff-prefs", JSON.stringify({ noteColor: "#62d9ff" }));
    await mount();
    expect(prefs.staffPrefs.noteColor).toBe("#62d9ff");
    await act(async () => {
      prefs.updateStaffPrefs({ playedNoteColor: "#abcdef" });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      noteColor: "#62d9ff",
      playedNoteColor: "#abcdef"
    });
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ noteColor: "#62d9ff", playedNoteColor: "#abcdef" });
  });
});
