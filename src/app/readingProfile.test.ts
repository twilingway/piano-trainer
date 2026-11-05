import { describe, expect, it } from "vitest";
import { normalizeStaffPrefs } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";
import { hydrateViewProfiles, activeViewFraming, selectViewProfile } from "./viewProfiles";
import { DEFAULT_SCREEN_LAYOUT } from "./screenLayout";
describe("clay keyboard preferences and lessons", () => {
  it("uses classic for absent/malformed choices, and preserves every explicit old style", () => {
    for (const raw of [null, {}, { keyStyle: "bad" }])
      expect(normalizeStaffPrefs(raw).keyStyle).toBe("classic");
    for (const keyStyle of ["classic", "arcade", "3d", "clay"] as const)
      expect(normalizeStaffPrefs({ keyStyle, keyboardOrientation: "top" })).toMatchObject({
        keyStyle,
        keyboardOrientation: keyStyle === "3d" || keyStyle === "clay" ? "top" : "follow"
      });
  });
  it("keeps clay during a lesson without mutating or persisting the player's own framing", () => {
    const prefs = normalizeStaffPrefs({
      keyStyle: "clay",
      lane: true,
      hands: true,
      labels: true,
      keyboardOrientation: "top"
    });
    const saved = JSON.stringify(prefs),
      effective = readingDisplayProfile(prefs);
    expect(effective).toMatchObject({ keyStyle: "clay", lane: false, hands: false, labels: false });
    expect(JSON.stringify(prefs)).toBe(saved);
    expect(normalizeStaffPrefs(JSON.parse(saved))).toEqual(prefs);
    for (const keyStyle of ["classic", "arcade", "3d"] as const)
      expect(readingDisplayProfile({ ...prefs, keyStyle }).keyStyle).toBe("classic");
  });
  it("persists separate clay and native3d camera profiles through a serialized roundtrip", () => {
    let profiles = hydrateViewProfiles(
      null,
      { keyStyle: "clay", keyboardOrientation: "top" },
      DEFAULT_SCREEN_LAYOUT
    );
    const clay = activeViewFraming(profiles);
    let next = selectViewProfile(profiles, clay, { keyboardStyle: "3d" });
    profiles = next.profiles;
    next = selectViewProfile(
      profiles,
      { ...next.framing, camera: { ...next.framing.camera, scale: 1.7 } },
      { keyboardStyle: "clay" }
    );
    expect(next.profiles.active).toMatchObject({
      keyboardStyle: "clay",
      keyboardOrientation: "top"
    });
    expect(next.framing).toEqual(clay);
    const restored = hydrateViewProfiles(JSON.parse(JSON.stringify(next.profiles)), {}, null);
    expect(restored).toEqual(next.profiles);
  });
});

it("uses a temporary standard beginner view and restores the saved range/free scene", () => {
  const saved = normalizeStaffPrefs({
    keyStyle: "clay",
    keyRange: "49",
    freeCamera: true,
    performanceScene: true
  });
  const before = JSON.stringify(saved);
  expect(readingDisplayProfile(saved, true)).toMatchObject({
    keyRange: "song",
    freeCamera: false,
    performanceScene: false
  });
  expect(readingDisplayProfile(saved, true).camera.pitch).toBe(18);
  expect(readingDisplayProfile(saved, true).keyboardOrientation).toBe("follow");
  expect(readingDisplayProfile(saved).camera).toBe(saved.camera);
  expect(readingDisplayProfile(saved)).toMatchObject({ freeCamera: true, performanceScene: true });
  expect(JSON.stringify(saved)).toBe(before);
});
