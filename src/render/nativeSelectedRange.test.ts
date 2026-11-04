import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { fittedNativeKeyboardCamera, naturalNativeKeyboardHeight } from "./nativeKeyboardFraming";
import { viewGeometry, USUAL_PLACEMENT } from "./viewGeometry";
import { CAMERA_PRESETS } from "./worldCamera";

function fitted(low: number, high: number, scale = 1, fov = 43) {
  const width = 1920,
    height = 1080;
  const keys = layoutKeyboard(width, low, high);
  const prefs = { ...CAMERA_PRESETS.top, scale, fov };
  const base = metricKeyboardCamera(width, width, height, prefs, 0.1, keys.values(), true);
  const natural = naturalNativeKeyboardHeight(base, true);
  const geometry = viewGeometry(
    height,
    [...keys.values()].find((key) => !key.black)?.width ?? 0,
    { keys: true, notes: true, hands: false },
    false,
    true,
    USUAL_PLACEMENT,
    natural
  );
  return { base, camera: fittedNativeKeyboardCamera(base, geometry.keyboardHeight, true, 1) };
}
const keyWidth = (camera: ReturnType<typeof fitted>["camera"]) =>
  camera.project(23.5, 22, 0).x - camera.project(0, 22, 0).x;

describe("the complete native selected-range framing", () => {
  it("really enlarges 25 and 49 over 88 after the final physical-height fit", () => {
    const twentyFive = fitted(48, 72),
      fortyNine = fitted(36, 84),
      all = fitted(21, 108);
    expect(keyWidth(twentyFive.camera)).toBeGreaterThan(keyWidth(fortyNine.camera) * 1.2);
    expect(keyWidth(fortyNine.camera)).toBeGreaterThan(keyWidth(all.camera) * 1.2);
    expect(twentyFive.base.params.nativeRangeFit).toBe(true);
    expect(twentyFive.camera.params.keyboardDepth).toBe(150);
  });
  it("keeps manual scale and FOV meaningful instead of refitting them away", () => {
    const base = keyWidth(fitted(21, 108).camera);
    expect(keyWidth(fitted(21, 108, 1.2).camera) / base).toBeGreaterThan(1.19);
    expect(keyWidth(fitted(21, 108, 1.2).camera) / base).toBeLessThan(1.21);
    expect(keyWidth(fitted(21, 108, 1, 60).camera)).toBeLessThan(base);
  });
  it("leaves the old non-opted-in camera calibration intact", () => {
    const keys = layoutKeyboard(1920, 48, 72);
    const legacy = metricKeyboardCamera(1920, 1920, 1080, CAMERA_PRESETS.top, 0.1, keys.values());
    expect(legacy.params.nativeRangeFit).toBeUndefined();
    expect(keyWidth(fitted(48, 72).base)).toBeGreaterThan(
      legacy.project(23.5, 22, 0).x - legacy.project(0, 22, 0).x
    );
  });
});
