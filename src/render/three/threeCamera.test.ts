import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, worldCamera } from "../worldCamera";
import type { CameraPrefs } from "../worldCamera";
import { projectionMatrix, viewMatrix } from "./threeCamera";

const VIEWS: readonly (readonly [number, number, number])[] = [
  // Screen width and height, and the camera's height (the view less the room for the hands).
  [1920, 1080, 1000],
  [390, 844, 700],
  [667, 375, 375]
];
const PREFS: readonly CameraPrefs[] = [
  DEFAULT_CAMERA,
  { fov: 25, height: 25, distance: 120, pitch: -5, targetY: -250, scale: 0.55 },
  { fov: 85, height: 420, distance: 1200, pitch: 60, targetY: 250, scale: 1.6 },
  { ...DEFAULT_CAMERA, pitch: 40, fov: 30, targetY: 80 }
];
// Key corners and points of the road: across the keyboard, from the front edge to far away.
const POINTS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [-300, 22, 0],
  [250, 22, 142],
  [-11, 36, 57],
  [400, 0, 142],
  [-120, 22, 2000]
];

describe("three camera", () => {
  it("lands every point where worldCamera does", () => {
    let checked = 0;
    for (const [width, height, cameraHeight] of VIEWS) {
      for (const prefs of PREFS) {
        const camera = worldCamera(width, cameraHeight, prefs);
        for (const offset of [
          { x: 0, y: 0 },
          { x: 35, y: -60 }
        ]) {
          const view = viewMatrix(camera.params);
          const projection = projectionMatrix(camera.params, width, height, offset);
          for (const [x, y, z] of POINTS) {
            const expected = camera.project(x, y, z);
            // Behind the camera worldCamera gives up; three clips it.
            if (expected.scale <= 0) continue;
            const s = prefs.scale;
            const ndc = new Vector3(x * s, y * s, -z * s)
              .applyMatrix4(view)
              .applyMatrix4(projection);
            expect(((ndc.x + 1) * width) / 2).toBeCloseTo(expected.x + offset.x, 0.5);
            expect(((1 - ndc.y) * height) / 2).toBeCloseTo(expected.y + offset.y, 0.5);
            expect(ndc.z).toBeGreaterThan(-1);
            expect(ndc.z).toBeLessThan(1);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
