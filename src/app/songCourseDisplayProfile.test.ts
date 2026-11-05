import { layoutKeyboard } from "../render/keyboardLayout";
import { metricKeyboardCamera } from "../render/metricKeyboardCamera";
import {
  fittedNativeKeyboardCamera,
  nativeKeyboardFootprint,
  naturalNativeKeyboardHeight
} from "../render/nativeKeyboardFraming";
import { USUAL_PLACEMENT, viewGeometry } from "../render/viewGeometry";
import { DEFAULT_CAMERA, type CameraPrefs } from "../render/worldCamera";
import { describe, expect, it } from "vitest";
import { normalizeStaffPrefs } from "./staffPreferences";
import { readingDisplayProfile } from "./readingProfile";
import { songCourseDisplayProfile } from "./songCourseDisplayProfile";

describe("responsive song course display", () => {
  it.each(["25", "49", "61", "88", "3oct", "4oct"] as const)(
    "honors the saved %s range on desktop without inheriting the forced reading range",
    (keyRange) => {
      const preferred = normalizeStaffPrefs({
        keyRange,
        keyStyle: "clay",
        freeCamera: true,
        performanceScene: true
      });
      const before = JSON.stringify(preferred);
      const display = readingDisplayProfile(preferred, true);
      expect(display.keyRange).toBe("song");
      const result = songCourseDisplayProfile({
        active: true,
        compact: false,
        preferred,
        display,
        learnerRange: [60, 72]
      });
      expect(result).toMatchObject({
        prefs: { keyRange, freeCamera: false, performanceScene: false },
        displayRange: undefined,
        keyboardMaxHeightShare: 0.3
      });
      expect(JSON.stringify(preferred)).toBe(before);
    }
  );

  it("uses a full desktop instrument for the saved song range without saving 88 keys", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "song" });
    const result = songCourseDisplayProfile({
      active: true,
      compact: false,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange: [60, 72]
    });
    expect(result.prefs.keyRange).toBe("88");
    expect(result.displayRange).toBeUndefined();
    expect(result.keyboardMaxHeightShare).toBe(0.3);
    expect(preferred.keyRange).toBe("song");
  });

  it("uses only the learner range on compact screens despite a wider saved instrument", () => {
    const preferred = normalizeStaffPrefs({ keyRange: "88" });
    const learnerRange = [60, 72] as const;
    const result = songCourseDisplayProfile({
      active: true,
      compact: true,
      preferred,
      display: readingDisplayProfile(preferred, true),
      learnerRange
    });
    expect(result.prefs.keyRange).toBe("song");
    expect(result.displayRange).toBe(learnerRange);
    expect(preferred.keyRange).toBe("88");
  });

  it.each(["clay", "3d", "classic", "arcade"] as const)(
    "keeps the selected %s keyboard available in both course layouts",
    (keyStyle) => {
      const preferred = normalizeStaffPrefs({ keyStyle });
      for (const compact of [true, false])
        expect(
          songCourseDisplayProfile({
            active: true,
            compact,
            preferred,
            display: readingDisplayProfile(preferred, true),
            learnerRange: [60, 72]
          }).prefs.keyStyle
        ).toBe(keyStyle);
    }
  );

  it("returns the ordinary or legacy display unchanged after leaving the song course", () => {
    const preferred = normalizeStaffPrefs({
      keyRange: "49",
      keyStyle: "3d",
      freeCamera: true,
      performanceScene: true
    });
    for (const display of [preferred, readingDisplayProfile(preferred, true)]) {
      const result = songCourseDisplayProfile({
        active: false,
        compact: true,
        preferred,
        display,
        learnerRange: undefined
      });
      expect(result.prefs).toBe(display);
      expect(result.displayRange).toBeUndefined();
      expect(result.keyboardMaxHeightShare).toBeUndefined();
    }
  });
});

it.each(["clay", "3d"] as const)(
  "uses a shallow temporary %s camera only on compact short viewports",
  (keyStyle) => {
    const preferred = normalizeStaffPrefs({ keyStyle, camera: { pitch: 60 } });
    const display = readingDisplayProfile(preferred, true);
    const before = JSON.stringify(preferred);
    const result = songCourseDisplayProfile({
      active: true,
      compact: true,
      shortViewport: true,
      preferred,
      display,
      learnerRange: [60, 72]
    });
    expect(result.prefs.camera).toEqual({
      ...display.camera,
      height: 150,
      distance: 900,
      pitch: 18
    });
    expect(display.camera.pitch).toBe(18);
    expect(preferred.camera.pitch).toBe(60);
    expect(JSON.stringify(preferred)).toBe(before);
    expect(
      songCourseDisplayProfile({
        active: false,
        compact: true,
        shortViewport: true,
        preferred,
        display: preferred,
        learnerRange: [60, 72]
      }).prefs
    ).toBe(preferred);
  }
);

it.each([
  { compact: true, shortViewport: false, keyStyle: "clay" as const },
  { compact: false, shortViewport: true, keyStyle: "clay" as const },
  { compact: true, shortViewport: true, keyStyle: "classic" as const },
  { compact: true, shortViewport: true, keyStyle: "arcade" as const }
])("does not change the existing camera for %j", ({ compact, shortViewport, keyStyle }) => {
  const preferred = normalizeStaffPrefs({ keyStyle });
  const display = readingDisplayProfile(preferred, true);
  const result = songCourseDisplayProfile({
    active: true,
    compact,
    shortViewport,
    preferred,
    display,
    learnerRange: [60, 72]
  });
  expect(result.prefs.camera).toBe(display.camera);
  expect(result.prefs.camera.pitch).toBe(18);
});

function compactNativeMetrics(prefs: CameraPrefs) {
  const width = 667,
    height = 375;
  const layout = layoutKeyboard(width, 60, 72);
  const base = metricKeyboardCamera(width, width, height, prefs, 0.1, layout.values(), true);
  const geometry = viewGeometry(
    height,
    width / 8,
    { keys: true, notes: false, hands: false },
    false,
    true,
    { ...USUAL_PLACEMENT, maxHeightShare: 0.3 },
    naturalNativeKeyboardHeight(base, false),
    height
  );
  const fitted = fittedNativeKeyboardCamera(base, geometry.keyboardHeight, false, 1);
  const whiteWidth = fitted.project(23.5, 22, 0).x - fitted.project(0, 22, 0).x;
  return {
    whiteWidth,
    octaveWidth: whiteWidth * 8,
    height: nativeKeyboardFootprint(fitted).height,
    physicalDepth: fitted.params.keyboardDepth,
    depthScale: fitted.params.keyboardDepthScale
  };
}

it("widens a short compact physical key to at least 44px within the same height budget", () => {
  const preferred = normalizeStaffPrefs({ keyStyle: "clay" });
  const display = readingDisplayProfile(preferred, true);
  const result = songCourseDisplayProfile({
    active: true,
    compact: true,
    shortViewport: true,
    preferred,
    display,
    learnerRange: [60, 72]
  });
  const before = compactNativeMetrics(display.camera);
  const after = compactNativeMetrics(result.prefs.camera);
  expect(before.whiteWidth).toBeCloseTo(36.0611516778842, 6);
  expect(after.whiteWidth).toBeGreaterThanOrEqual(44);
  expect(after.whiteWidth).toBeGreaterThan(before.whiteWidth * 1.2);
  expect(after.height).toBeCloseTo(375 * 0.3, 6);
  expect(after.physicalDepth).toBe(150);
  expect(after.depthScale).toBeUndefined();
  expect(display.camera).toEqual({ ...DEFAULT_CAMERA, pitch: 18 });
});
