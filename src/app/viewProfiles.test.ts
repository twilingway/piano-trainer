import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS, DEFAULT_CAMERA } from "../render/worldCamera";
import { DEFAULT_SCREEN_LAYOUT } from "./screenLayout";
import {
  activeViewFraming,
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
    const direct = selectViewProfile(original, edited, { notesProjection: "direct" });
    expect(direct.framing).toEqual(original.legacySeed);
    const returned = selectViewProfile(direct.profiles, direct.framing, {
      notesProjection: "perspective"
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
    expect(profiles.active.keyboardOrientation).toBe("follow");
    choose({ keyboardStyle: "classic" });
    choose({ notesProjection: "perspective" });
    choose({ keyboardStyle: "3d" });
    expect(profiles.active.notesProjection).toBe("direct");
    choose({ notesProjection: "perspective" });
    expect(profiles.active.keyboardOrientation).toBe("top");
    choose({ keyboardStyle: "classic", keyboardOrientation: "top" });
    expect(profiles.active.keyboardOrientation).toBe("follow");
    expect(normalizeViewAxes({ keyboardStyle: "bogus", notesProjection: "bogus" })).toEqual({
      keyboardStyle: "arcade",
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
