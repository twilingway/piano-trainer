import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS, DEFAULT_CAMERA } from "../render/worldCamera";
import { DEFAULT_SCREEN_LAYOUT } from "./screenLayout";
import {
  activeViewFraming,
  editViewCamera,
  hydrateViewProfiles,
  normalizeViewAxes,
  saveViewFraming,
  selectViewProfile,
  viewProfileKey
} from "./viewProfiles";

const legacy = {
  keyStyle: "3d",
  road: true,
  camera: { ...CAMERA_PRESETS.hands, scale: 1.2 },
  roadFar: 0.27,
  roadHorizon: 0.18
};
const layout = { ...DEFAULT_SCREEN_LAYOUT, keysY: 103, tickerGap: -12, keysScale: 1.3 };

describe("view profile migration and pure transitions", () => {
  it("preserves every legacy framing field without a first-frame jump", () => {
    const profiles = hydrateViewProfiles(null, legacy, layout);
    expect(profiles.active).toEqual({
      keyboardStyle: "3d",
      notesProjection: "perspective",
      keyboardOrientation: "follow"
    });
    expect(activeViewFraming(profiles)).toEqual({
      camera: legacy.camera,
      roadFar: legacy.roadFar,
      roadHorizon: legacy.roadHorizon,
      layout
    });
    expect(hydrateViewProfiles(JSON.parse(JSON.stringify(profiles)), {}, {})).toEqual(profiles);
  });

  it("seeds unseen combinations from the immutable migration seed, never the edited neighbor", () => {
    const original = hydrateViewProfiles(null, legacy, layout);
    const edited = {
      ...activeViewFraming(original),
      camera: CAMERA_PRESETS.top,
      layout: { ...layout, keysY: -80 }
    };
    const classic = selectViewProfile(original, edited, { keyboardStyle: "classic" });
    expect(classic.framing).toEqual(original.legacySeed);
    const returned = selectViewProfile(classic.profiles, classic.framing, {
      keyboardStyle: "3d"
    });
    expect(returned.framing).toEqual(edited);
    expect(returned.profiles.legacySeed).toEqual(original.legacySeed);
    expect(original.entries[viewProfileKey(original.active)]).toEqual(original.legacySeed);
  });

  it("remembers projection by style and orientation by style/projection pair", () => {
    let profiles = hydrateViewProfiles(null, legacy, layout);
    const choose = (selection: Parameters<typeof selectViewProfile>[2]) => {
      profiles = selectViewProfile(profiles, activeViewFraming(profiles), selection).profiles;
    };
    choose({ keyboardOrientation: "top" });
    choose({ notesProjection: "direct" });
    expect(profiles.active.keyboardOrientation).toBe("top");
    choose({ keyboardStyle: "classic" });
    choose({ notesProjection: "perspective" });
    choose({ keyboardStyle: "3d" });
    expect(profiles.active.notesProjection).toBe("direct");
    choose({ notesProjection: "perspective" });
    expect(profiles.active.keyboardOrientation).toBe("top");
    choose({ keyboardStyle: "classic", keyboardOrientation: "top" });
    expect(profiles.active.keyboardOrientation).toBe("follow");
    expect(normalizeViewAxes({ keyboardStyle: "bogus", notesProjection: "bogus" })).toEqual({
      keyboardStyle: "3d",
      notesProjection: "direct",
      keyboardOrientation: "follow"
    });
  });

  it("repairs damaged fields independently, prefers saved records and retains unknown profiles", () => {
    const initial = hydrateViewProfiles(null, legacy, layout);
    const key = viewProfileKey(initial.active);
    const future = { camera: { futureLens: 4 }, futureData: [1, 2, 3] };
    const profiles = hydrateViewProfiles(
      {
        ...initial,
        entries: {
          ...initial.entries,
          "future:projection:mode": future,
          [key]: {
            ...activeViewFraming(initial),
            camera: { ...legacy.camera, height: "broken", pitch: 90, targetY: 900 },
            roadFar: null,
            layout: { ...layout, keysY: "broken", tickerScale: 1.7 }
          }
        }
      },
      { camera: DEFAULT_CAMERA },
      DEFAULT_SCREEN_LAYOUT
    );
    const framing = activeViewFraming(profiles);
    expect(framing.camera.height).toBe(legacy.camera.height);
    expect(framing.camera.pitch).toBe(90);
    expect(framing.camera.targetY).toBe(250);
    expect(framing.roadFar).toBe(legacy.roadFar);
    expect(framing.layout.keysY).toBe(layout.keysY);
    expect(framing.layout.tickerScale).toBe(1.7);
    const next = saveViewFraming(profiles, { ...framing, roadHorizon: 0.2 });
    expect(next.entries["future:projection:mode"]).toEqual(future);
    expect(hydrateViewProfiles(next, {}, {}).entries["future:projection:mode"]).toEqual(future);
  });
});

describe("explicit native note projection", () => {
  it("carries camera, every layout field and orientation while restoring only target road shape", () => {
    const camera = { ...CAMERA_PRESETS.top, height: 930, scale: 1.1, targetY: -125 };
    const fullLayout = {
      ...layout,
      staffShare: 0.62,
      keysLift: 0.18,
      keysX: 72,
      tickerX: 120,
      tickerScale: 1.7,
      laneTop: 0.3
    };
    const original = hydrateViewProfiles(
      null,
      { ...legacy, camera, keyboardOrientation: "top" },
      fullLayout
    );
    const targetKey = "3d:direct:top";
    const profiles = {
      ...original,
      entries: {
        ...original.entries,
        [targetKey]: {
          camera: CAMERA_PRESETS.player,
          layout: DEFAULT_SCREEN_LAYOUT,
          roadFar: 0.43,
          roadHorizon: 0.32
        }
      },
      orientationByPair: { ...original.orientationByPair, "3d:direct": "follow" }
    };
    const direct = selectViewProfile(profiles, activeViewFraming(profiles), {
      notesProjection: "direct"
    });
    expect(direct.profiles.active.keyboardOrientation).toBe("top");
    expect(direct.framing).toEqual({
      camera,
      layout: fullLayout,
      roadFar: 0.43,
      roadHorizon: 0.32
    });
    const returned = selectViewProfile(direct.profiles, direct.framing, {
      notesProjection: "perspective"
    });
    expect(returned.framing).toEqual(original.legacySeed);
    expect(returned.profiles.legacySeed).toEqual(original.legacySeed);
    const reloaded = hydrateViewProfiles(JSON.parse(JSON.stringify(direct.profiles)), {}, {});
    expect(activeViewFraming(reloaded)).toEqual(direct.framing);
  });

  it("preserves the keyboard camera on projection-only choices in every style, including overhead", () => {
    for (const keyStyle of ["3d", "perspective", "classic", "arcade"]) {
      const camera = keyStyle === "3d" ? CAMERA_PRESETS.hands : CAMERA_PRESETS.top;
      const original = hydrateViewProfiles(null, { ...legacy, keyStyle, camera }, layout);
      const result = selectViewProfile(original, activeViewFraming(original), {
        notesProjection: "direct"
      });
      expect(result.framing.camera).toEqual(camera);
      expect(result.framing.layout).toEqual(layout);
    }
  });

  it("lets an explicit native camera edit clear top without restoring another profile's layout", () => {
    const original = hydrateViewProfiles(null, { ...legacy, keyboardOrientation: "top" }, layout);
    const current = activeViewFraming(original);
    const profiles = {
      ...original,
      entries: {
        ...original.entries,
        "3d:perspective:follow": {
          camera: CAMERA_PRESETS.top,
          roadFar: 0.8,
          roadHorizon: 0.5,
          layout: DEFAULT_SCREEN_LAYOUT
        }
      }
    };
    const result = editViewCamera(profiles, current, CAMERA_PRESETS.player);
    expect(result.profiles.active).toEqual({ ...original.active, keyboardOrientation: "follow" });
    expect(result.framing).toEqual({ ...current, camera: CAMERA_PRESETS.player });
    expect(result.profiles.entries[viewProfileKey(original.active)]).toEqual(current);
    expect(result.profiles.legacySeed).toEqual(original.legacySeed);
    const restoredTop = selectViewProfile(result.profiles, result.framing, {
      keyboardOrientation: "top"
    });
    expect(restoredTop.framing).toEqual(current);
  });
});

describe("unified keyboard migration", () => {
  it.each([null, {}, { hands: true }, { keyStyle: "classic" }])(
    "uses the full top preset when the legacy camera is absent: %j",
    (staff) => {
      const profiles = hydrateViewProfiles(null, staff, null);
      expect(activeViewFraming(profiles).camera).toEqual(CAMERA_PRESETS.top);
      expect(profiles.active.keyboardOrientation).toBe("follow");
    }
  );

  it("keeps the old player fallback for an explicitly saved partial camera", () => {
    const profiles = hydrateViewProfiles(null, { camera: { fov: 60 } }, null);
    expect(activeViewFraming(profiles).camera).toEqual({ ...DEFAULT_CAMERA, fov: 60 });
  });

  it("migrates the legacy perspective style and keeps its camera and projection", () => {
    const profiles = hydrateViewProfiles(null, { ...legacy, keyStyle: "perspective" }, layout);
    expect(profiles.active).toEqual({
      keyboardStyle: "3d",
      notesProjection: "perspective",
      keyboardOrientation: "follow"
    });
    expect(activeViewFraming(profiles)).toEqual({
      camera: legacy.camera,
      roadFar: legacy.roadFar,
      roadHorizon: legacy.roadHorizon,
      layout
    });
  });

  it.each([false, true])(
    "migrates the old active entry with explicit destination=%s",
    (destination) => {
      const oldEntry = { camera: CAMERA_PRESETS.hands, layout, roadFar: 0.4, roadHorizon: 0.2 };
      const newEntry = { ...oldEntry, camera: CAMERA_PRESETS.player, roadFar: 0.7 };
      const profiles = hydrateViewProfiles(
        {
          version: 1,
          active: {
            keyboardStyle: "perspective",
            notesProjection: "perspective",
            keyboardOrientation: "follow"
          },
          entries: {
            "perspective:perspective:follow": oldEntry,
            ...(destination ? { "3d:perspective:follow": newEntry } : {}),
            "future:mode:unknown": { privateData: [1, 2] }
          },
          projectionByStyle: { perspective: "perspective" },
          orientationByPair: { "perspective:perspective": "follow" }
        },
        {},
        null
      );
      expect(profiles.active.keyboardStyle).toBe("3d");
      expect(activeViewFraming(profiles)).toEqual(destination ? newEntry : oldEntry);
      expect(profiles.entries["perspective:perspective:follow"]).toEqual(oldEntry);
      expect(profiles.entries["future:mode:unknown"]).toEqual({ privateData: [1, 2] });
      expect(profiles.projectionByStyle.perspective).toBe("perspective");
      expect(hydrateViewProfiles(JSON.parse(JSON.stringify(profiles)), {}, null)).toEqual(profiles);
    }
  );
});

it("round-trips the extended horizon in saved framing without changing the legacy seed", () => {
  const original = hydrateViewProfiles(null, { ...legacy, roadHorizon: 1.2 }, layout);
  const saved = saveViewFraming(original, { ...activeViewFraming(original), roadHorizon: 1.4 });
  const classic = selectViewProfile(saved, activeViewFraming(saved), { keyboardStyle: "classic" });
  const returned = selectViewProfile(classic.profiles, classic.framing, { keyboardStyle: "3d" });
  expect(returned.framing.roadHorizon).toBe(1.4);
  const restored = hydrateViewProfiles(
    JSON.parse(JSON.stringify(returned.profiles)),
    legacy,
    layout
  );
  expect(activeViewFraming(restored).roadHorizon).toBe(1.4);
  expect(restored.legacySeed.roadHorizon).toBe(1.2);
});
