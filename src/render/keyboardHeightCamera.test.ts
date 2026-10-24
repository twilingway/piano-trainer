import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { keyboardHeightCamera } from "./keyboardHeightCamera";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { CAMERA_PRESETS } from "./worldCamera";

describe("standard 3D keyboard height", () => {
  it("changes longitudinal depth without changing key rise, rear contact or saved pose", () => {
    const keys = layoutKeyboard(2288, 21, 108);
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
      [667, 375]
    ] as const) {
      for (const preset of Object.values(CAMERA_PRESETS)) {
        const base = metricKeyboardCamera(width, 2288, height, preset, 0.1, keys.values());
        for (const wanted of [60, 120, 240]) {
          const camera = keyboardHeightCamera(base, wanted);
          const rear = camera.project(0, 22, 150);
          expect(rear).toEqual(base.project(0, 22, 150));
          expect(camera.project(0, 22, 0).y - rear.y).toBeCloseTo(wanted, 7);
          expect(camera.params.prefs).toBe(base.params.prefs);
          for (const y of [0, 22, 34])
            for (const z of [0, 75, 150])
              for (const x of [-250, 0, 250]) {
                const transformed = new Vector3(x, y, -z)
                  .multiplyScalar(base.params.prefs.scale)
                  .applyMatrix4(viewMatrix(camera.params))
                  .applyMatrix4(viewMatrix(base.params).invert());
                expect(transformed.x).toBeCloseTo(x * base.params.prefs.scale, 7);
                expect(transformed.y).toBeCloseTo(y * base.params.prefs.scale, 7);
                if (z === 150) expect(camera.project(x, y, z).x).toBe(base.project(x, y, z).x);
                for (const offset of [
                  { x: 0, y: 0 },
                  { x: 35, y: -25 }
                ] as const) {
                  const point = camera.project(x, y, z);
                  const ndc = new Vector3(x, y, -z)
                    .multiplyScalar(base.params.prefs.scale)
                    .applyMatrix4(viewMatrix(camera.params))
                    .applyMatrix4(projectionMatrix(camera.params, width, height, offset));
                  expect(((ndc.x + 1) * width) / 2).toBeCloseTo(point.x + offset.x, 6);
                  expect(((1 - ndc.y) * height) / 2).toBeCloseTo(point.y + offset.y, 6);
                }
              }
        }
      }
    }
  });
  it("leaves invalid requests unchanged", () => {
    const keys = layoutKeyboard(2288, 21, 108);
    const base = metricKeyboardCamera(1366, 2288, 768, CAMERA_PRESETS.player, 0.1, keys.values());
    for (const height of [0, -1, NaN, Infinity])
      expect(keyboardHeightCamera(base, height)).toBe(base);
  });
});
