import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { CAMERA_PRESETS, DEFAULT_CAMERA, PANEL_EDGE, worldCamera } from "./worldCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";

describe("bounded overhead range fit", () => {
  it.each([
    [390, 700],
    [1280, 640],
    [1920, 1000]
  ])(
    "fits all 88 real key bounds at %s by %s without changing preferences or hit row",
    (width, height) => {
      const total = 52 * 44;
      const keys = layoutKeyboard(total, 21, 108);
      const pan = (total - width) / 2;
      const prefs = { ...CAMERA_PRESETS.top, scale: 1.4 };
      const initial = worldCamera(width, height, prefs, PANEL_EDGE, 0.1);
      const fit = { left: initial.sourceX(0), right: initial.sourceX(total), pan };
      const fitted = worldCamera(width, height, prefs, PANEL_EDGE, 0.1, fit);
      expect(fitted.params.prefs).toBe(prefs);
      expect(fitted.params.orthographicScale).toBeLessThanOrEqual(
        initial.params.orthographicScale ?? 0
      );
      expect(fitted.road.at(width / 2, 1).y).toBeCloseTo(initial.road.at(width / 2, 1).y, 7);
      const view = viewMatrix(fitted.params);
      const projection = projectionMatrix(fitted.params, width, height);
      for (const key of keys.values()) {
        for (const edge of [key.x, key.x + key.width]) {
          const x = fitted.sourceX(edge - pan);
          const point = fitted.project(x, 22, 142);
          expect(point.x).toBeGreaterThanOrEqual(12 - 0.00001);
          expect(point.x).toBeLessThanOrEqual(width - 12 + 0.00001);
          const gpu = new Vector3(x * prefs.scale, 22 * prefs.scale, -142 * prefs.scale)
            .applyMatrix4(view)
            .applyMatrix4(projection);
          expect(((gpu.x + 1) * width) / 2).toBeCloseTo(point.x, 7);
          expect(((1 - gpu.y) * height) / 2).toBeCloseTo(point.y, 7);
        }
      }
      expect(fitted.road.at(width / 2, 0).y).toBeLessThan(fitted.road.at(width / 2, 1).y);
    }
  );

  it("never magnifies a short range or adds zoom to a perspective road", () => {
    const short = { left: -165, right: 165, pan: 0 };
    const baseline = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    const fitted = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1, short);
    expect(fitted.params.orthographicScale).toBe(baseline.params.orthographicScale);
    for (const prefs of [DEFAULT_CAMERA, { ...CAMERA_PRESETS.top, pitch: 89 }]) {
      const original = worldCamera(390, 700, prefs, PANEL_EDGE, 0.1);
      const perspective = worldCamera(390, 700, prefs, PANEL_EDGE, 0.1, {
        left: -800,
        right: 800,
        pan: 0
      });
      expect(perspective.project(500, 22, 142)).toEqual(original.project(500, 22, 142));
      expect(perspective.roadFarZ).toBe(original.roadFarZ);
    }
  });

  it("keeps corrupt or zero-size bounds finite without mutating persisted scale", () => {
    for (const width of [0, 390])
      for (const fit of [
        { left: 10, right: 0, pan: 0 },
        { left: Number.NaN, right: 800, pan: 0 },
        { left: -800, right: 800, pan: Infinity }
      ]) {
        const camera = worldCamera(width, 500, CAMERA_PRESETS.top, PANEL_EDGE, 0.1, fit);
        const projected = camera.project(100, 36, 142);
        expect([projected.x, projected.y, projected.scale].every(Number.isFinite)).toBe(true);
        expect(camera.params.prefs.scale).toBe(1);
      }
  });
});
