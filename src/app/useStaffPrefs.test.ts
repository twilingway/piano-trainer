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
  it("drops saved artistic projection parameters and keeps the rest of the view", async () => {
    localStorage.setItem(
      "staff-prefs",
      JSON.stringify({
        keyStyle: "3d",
        roadFar: 0.4,
        noteProjection: { version: 1, mode: "stylizedProjection", horizonRadius: 3.25 }
      })
    );
    await mount();
    expect(prefs.staffPrefs).not.toHaveProperty("noteProjection");
    expect(prefs.staffPrefs.keyStyle).toBe("3d");
    expect(prefs.staffPrefs.roadFar).toBe(0.4);
    expect(normalizeStaffPrefs({ noteProjection: { mode: "stylizedProjection" } })).toEqual(
      normalizeStaffPrefs({})
    );
  });

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
  it("keeps distinct direct and perspective source layouts across reload and preserves screen framing", async () => {
    await mount();
    expect(prefs.staffPrefs.freeDirectField).toEqual({
      tilt: 90,
      length: 2,
      width: 4,
      radius: 4,
      shape: "line"
    });
    expect(prefs.staffPrefs.freePerspectiveField).toEqual({
      tilt: 26.57,
      length: 4.47,
      width: 6,
      radius: 6,
      shape: "line"
    });
    await act(async () => {
      prefs.updateStaffPrefs({
        freeDirectField: { tilt: 30, length: 1, width: 8, shape: "convex" },
        freePerspectiveField: { tilt: 20, length: 7, width: 12, shape: "concave" },
        roadFar: -0.4,
        roadHorizon: 0.2
      });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({
      freeDirectField: { tilt: 30, length: 1, width: 8, shape: "convex" },
      freePerspectiveField: { tilt: 20, length: 7, width: 12, shape: "concave" },
      roadFar: -0.4,
      roadHorizon: 0.2
    });
  });
  it("normalizes malformed source profiles independently", () => {
    const normalized = normalizeStaffPrefs({
      freeDirectField: { height: -1, distance: 100, width: 0, shape: "sphere" },
      freePerspectiveField: { height: NaN }
    });
    // Old fields are migrated: 1 m below at 100 m back is a −0.57° field 100 m long.
    expect(normalized.freeDirectField).toEqual({
      tilt: -0.57,
      length: 100,
      width: 0.25,
      radius: 0.25,
      shape: "line"
    });
    expect(normalized.freePerspectiveField).toEqual({
      tilt: 26.57,
      length: 4.47,
      width: 6,
      radius: 6,
      shape: "line"
    });
  });
  it.each([-1, -0.5, 0, 0.1, 0.9])(
    "preserves signed far width %s through reload",
    async (roadFar) => {
      localStorage.setItem("staff-prefs", JSON.stringify({ roadFar }));
      await mount();
      expect(prefs.staffPrefs.roadFar).toBe(roadFar);
      expect(normalizeStaffPrefs({ roadFar: -2 }).roadFar).toBe(-1);
      expect(normalizeStaffPrefs({ roadFar: 2 }).roadFar).toBe(0.9);
    }
  );
  it("defaults WASD off, rejects invalid flags and persists its opt-in independently", async () => {
    expect(normalizeStaffPrefs({ freeCameraWasd: "true" }).freeCameraWasd).toBe(false);
    await mount();
    expect(prefs.staffPrefs.freeCameraWasd).toBe(false);
    await act(async () => {
      prefs.updateStaffPrefs({ freeCameraWasd: true, freeCamera: false });
      await Promise.resolve();
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ freeCameraWasd: true, freeCamera: false });
  });
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
      JSON.stringify({ flatNoteBurning: "false", flatPressEffects: 0, noteParticles: "false" })
    );
    await mount();
    expect(prefs.staffPrefs.flatNoteBurning).toBe(true);
    expect(prefs.staffPrefs.flatPressEffects).toBe(true);
    expect(prefs.staffPrefs.noteParticles).toBe(true);
  });

  it("persists independent toggles across style changes and reloads", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({
        keyStyle: "classic",
        flatNoteBurning: false,
        flatPressEffects: true,
        noteParticles: false
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
    expect(prefs.staffPrefs.noteParticles).toBe(false);
    await act(async () => {
      prefs.updateStaffPrefs({ flatNoteBurning: true });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      flatNoteBurning: true,
      flatPressEffects: false,
      noteParticles: false
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

it.each([undefined, "unknown", 42, null])(
  "defaults malformed note appearance %s to filled",
  (fallingNoteStyle) => {
    expect(normalizeStaffPrefs({ fallingNoteStyle, roadHorizon: 0.4 })).toMatchObject({
      fallingNoteStyle: "filled",
      roadHorizon: 0.4
    });
  }
);
it.each(["filled", "flat", "glass"] as const)(
  "preserves saved %s note appearance",
  (fallingNoteStyle) => {
    expect(normalizeStaffPrefs({ fallingNoteStyle })).toMatchObject({ fallingNoteStyle });
  }
);
it("retains the 3D note choice while using flat keys and after reload", async () => {
  await mount();
  await act(async () => {
    prefs.updateStaffPrefs({ fallingNoteStyle: "glass", keyStyle: "classic" });
    await Promise.resolve();
  });
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  root = createRoot(host);
  await mount();
  expect(prefs.staffPrefs.fallingNoteStyle).toBe("glass");
  expect(prefs.staffPrefs.keyStyle).toBe("classic");
  await act(async () => {
    prefs.updateStaffPrefs({ keyStyle: "3d" });
    await Promise.resolve();
  });
  expect(prefs.staffPrefs.fallingNoteStyle).toBe("glass");
});

describe("world camera", () => {
  it("preserves independent cameras and signed horizon values through reload", async () => {
    await mount();
    const original = prefs.staffPrefs.camera;
    await act(async () => {
      prefs.updateStaffPrefs({
        freeCamera: true,
        worldFov: 73,
        freePerspectiveField: {
          tilt: -20.07,
          length: 87.57,
          width: 95.25,
          radius: 160,
          shape: "convex"
        }
      });
      await Promise.resolve();
    });
    expect(prefs.staffPrefs.camera).toEqual(original);
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({
      freeCamera: true,
      worldFov: 73,
      freePerspectiveField: {
        tilt: -20.07,
        length: 87.57,
        width: 95.25,
        radius: 160,
        shape: "convex"
      }
    });
    expect(prefs.staffPrefs.camera).toEqual(original);
  });
  it("safely fills older or corrupt saved camera choices", () => {
    expect(normalizeStaffPrefs({ worldFov: "80" }).worldFov).toBe(45);
    expect(normalizeStaffPrefs({ worldFov: 120 }).worldFov).toBe(100);
  });
  it("turns the removed free-world composition into the free camera and drops the field", () => {
    const camera = { ...CAMERA_PRESETS.player, pitch: 30 };
    const free = normalizeStaffPrefs({ cameraComposition: "free", worldFov: 70, camera });
    expect(free).toMatchObject({ freeCamera: true, worldFov: 70, camera });
    expect(free).not.toHaveProperty("cameraComposition");
    for (const cameraComposition of ["game", "other", 3, null]) {
      expect(normalizeStaffPrefs({ cameraComposition }).freeCamera).toBe(false);
      expect(normalizeStaffPrefs({ cameraComposition, freeCamera: true }).freeCamera).toBe(true);
      expect(normalizeStaffPrefs({ cameraComposition })).not.toHaveProperty("cameraComposition");
    }
  });
  it("restores the road straightening and repairs only its own corrupt values", () => {
    // Straight lanes into the keys by default; the bend stays a choice.
    expect(normalizeStaffPrefs({})).toMatchObject({ roadFit: "auto", roadFitCamera: null });
    expect(normalizeStaffPrefs({ roadFit: "button" }).roadFit).toBe("button");
    const snapshot = { ...CAMERA_PRESETS.player, pitch: 30 };
    const saved = normalizeStaffPrefs({ roadFit: "auto", roadFitCamera: snapshot, worldFov: 60 });
    expect(saved).toMatchObject({ roadFit: "auto", roadFitCamera: snapshot, worldFov: 60 });
    const broken = normalizeStaffPrefs({
      roadFit: "sideways",
      roadFitCamera: { ...snapshot, fov: Number.NaN },
      roadHorizon: 1.2
    });
    expect(broken.roadFit).toBe("auto");
    expect(broken.roadFitCamera).toEqual({ ...snapshot, fov: 43 });
    expect(broken.roadHorizon).toBe(1.2);
    expect(normalizeStaffPrefs({ roadFitCamera: "top" }).roadFitCamera).toBeNull();
  });
  it("keeps notes in the world direction by default and repairs the note tilt", () => {
    expect(normalizeStaffPrefs({}).roadNoteTilt).toBe(0);
    expect(normalizeStaffPrefs({ roadNoteTilt: 0.35 }).roadNoteTilt).toBe(0.35);
    expect(normalizeStaffPrefs({ roadNoteTilt: 1.4 }).roadNoteTilt).toBe(1);
    expect(normalizeStaffPrefs({ roadNoteTilt: -0.2 }).roadNoteTilt).toBe(0);
    const broken = normalizeStaffPrefs({ roadNoteTilt: "steep", roadFit: "button" });
    expect(broken).toMatchObject({ roadNoteTilt: 0, roadFit: "button" });
  });

  it("repairs only the corrupt one of the keyboard and world camera sets", () => {
    const keyboard = { ...CAMERA_PRESETS.player, height: 610, pitch: 30 };
    const broken = normalizeStaffPrefs({
      camera: { ...keyboard, fov: Number.NaN, distance: Infinity },
      worldFov: 72,
      roadHorizon: 1.2
    });
    expect(broken.camera).toEqual({ ...keyboard, fov: 43, distance: 720 });
    expect(broken.worldFov).toBe(72);
    expect(broken.roadHorizon).toBe(1.2);
    const world = normalizeStaffPrefs({ camera: keyboard, worldFov: Infinity, roadHorizon: 1.2 });
    expect(world.camera).toEqual(keyboard);
    expect(world.worldFov).toBe(45);
    expect(world.roadHorizon).toBe(1.2);
  });
});

describe("extended screen horizon", () => {
  it.each([
    [0.6, 0.6],
    [1.2, 1.2],
    [2, 1.5],
    [-1, 0],
    [Number.NaN, 0.1],
    [Infinity, 0.1]
  ])("normalizes screen horizon %s to %s", (value, expected) => {
    expect(normalizeStaffPrefs({ roadHorizon: value }).roadHorizon).toBe(expected);
  });
  it("restores a below-keyboard horizon through profile changes and reload", async () => {
    await mount();
    await act(async () => {
      prefs.updateStaffPrefs({ road: true, roadHorizon: 1.2, roadFar: -0.01 });
      await Promise.resolve();
    });
    expect(prefs.staffPrefs.roadHorizon).toBe(1.2);
    await act(async () => {
      prefs.updateStaffPrefs({ keyStyle: "classic" });
      await Promise.resolve();
    });
    await act(async () => {
      prefs.updateStaffPrefs({ keyStyle: "3d" });
      await Promise.resolve();
    });
    expect(prefs.staffPrefs).toMatchObject({ roadHorizon: 1.2, roadFar: -0.01 });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ roadHorizon: 1.2, roadFar: -0.01 });
  });
});

describe("independent notation sizes", () => {
  it.each([
    [{ zoom: 1.5 }, { zoom: 1.5, tabsZoom: 1.5 }],
    [{ zoom: 9 }, { zoom: 2, tabsZoom: 2 }],
    [{ zoom: 0.1 }, { zoom: 0.5, tabsZoom: 0.5 }],
    [
      { zoom: 1.5, tabsZoom: 0.8 },
      { zoom: 1.5, tabsZoom: 0.8 }
    ],
    [
      { zoom: 1.5, tabsZoom: null },
      { zoom: 1.5, tabsZoom: 1 }
    ],
    [
      { zoom: Number.NaN, tabsZoom: 1.8 },
      { zoom: 1, tabsZoom: 1.8 }
    ],
    [
      { zoom: 1.5, tabsZoom: Number.POSITIVE_INFINITY },
      { zoom: 1.5, tabsZoom: 1 }
    ]
  ])("normalizes legacy and explicit sizes %j", (raw, expected) => {
    expect(normalizeStaffPrefs(raw)).toMatchObject(expected);
  });

  it("keeps the other size on changes and restores both after reload", async () => {
    localStorage.setItem("staff-prefs", JSON.stringify({ zoom: 1.5 }));
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ zoom: 1.5, tabsZoom: 1.5 });
    await act(async () => {
      prefs.updateStaffPrefs({ zoom: 1.8 });
      await Promise.resolve();
    });
    expect(prefs.staffPrefs).toMatchObject({ zoom: 1.8, tabsZoom: 1.5 });
    await act(async () => {
      prefs.updateStaffPrefs({ tabsZoom: 0.8 });
      await Promise.resolve();
    });
    expect(JSON.parse(localStorage.getItem("staff-prefs") ?? "{}")).toMatchObject({
      zoom: 1.8,
      tabsZoom: 0.8
    });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(prefs.staffPrefs).toMatchObject({ zoom: 1.8, tabsZoom: 0.8 });
  });
});
