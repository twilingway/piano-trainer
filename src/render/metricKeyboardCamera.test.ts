import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "./keyboardLayout";
import { KEYBOARD_DEPTH, KEYBOARD_DIP, metricC4X, metricKeyX } from "./keyboardMetrics";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { DEFAULT_CAMERA, worldCamera } from "./worldCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";

describe("metric song-range camera", () => {
  it.each([
    [390, 1080, 21, 108],
    [1280, 1280, 48, 72],
    [1280, 1280, 60, 64]
  ])(
    "frames range %s/%s/%s..%s by projection, retaining physical dimensions",
    (width, source, low, high) => {
      const keys = layoutKeyboard(source, low, high);
      const pan = (source - width) / 2;
      for (const pitch of [-5, 25, 85, 90]) {
        for (const scale of [0.55, 1, 1.6]) {
          const camera = metricKeyboardCamera(
            width,
            source,
            640,
            { ...DEFAULT_CAMERA, pitch, scale },
            0.2,
            keys.values()
          );
          expect(camera.params.keyboardDepth).toBe(KEYBOARD_DEPTH);
          expect(camera.near).toEqual({ y: 22, z: 150 });
          const c4 = metricC4X(keys.values(), camera.sourceX);
          for (const key of keys.values()) {
            const x = camera.sourceX(key.x + key.width / 2 - pan);
            const centre = camera.project(x, key.black ? 34 : 22, 0);
            expect(centre.x).toBeGreaterThanOrEqual(11);
            expect(centre.x).toBeLessThanOrEqual(width - 11);
            expect(
              c4 + metricKeyX(key.pitch) - pan * (camera.params.sourceUnits ?? 0.5)
            ).toBeCloseTo(x, 9);
          }
          const white = [...keys.values()].find((key) => !key.black);
          if (!white) throw new Error("Missing white key");
          const x = camera.sourceX(white.x + white.width / 2 - pan);
          const front = new Vector3(x, 22, 0);
          const back = new Vector3(x, 22, -KEYBOARD_DEPTH);
          expect(front.distanceTo(back)).toBe(150);
          expect(front.distanceTo(front.clone().add(new Vector3(0, -KEYBOARD_DIP, 0)))).toBe(8);
        }
      }
    }
  );

  it("keeps CPU road contact and the native matrix projection aligned after pan, zoom and offset", () => {
    const width = 390,
      height = 720,
      source = 1080,
      pan = (source - width) / 2;
    const keys = layoutKeyboard(source, 21, 108);
    const prefs = { ...DEFAULT_CAMERA, scale: 1.6, pitch: 85 };
    const camera = metricKeyboardCamera(width, source, 640, prefs, 0.2, keys.values());
    const offset = { x: 31, y: -28 };
    const view = viewMatrix(camera.params);
    const projection = projectionMatrix(camera.params, width, height, offset);
    for (const key of keys.values()) {
      const x = camera.sourceX(key.x + key.width / 2 - pan);
      const y = key.black ? 34 : 22;
      const z = key.black ? 149.8008 : KEYBOARD_DEPTH;
      const expected = camera.project(x, y, z);
      const clip = new Vector3(x * prefs.scale, y * prefs.scale, -z * prefs.scale)
        .applyMatrix4(view)
        .applyMatrix4(projection);
      expect(((clip.x + 1) * width) / 2).toBeCloseTo(expected.x + offset.x, 8);
      expect(((1 - clip.y) * height) / 2).toBeCloseTo(expected.y + offset.y, 8);
    }
  });

  it("preserves the legacy camera's source units and depth outside native 3D", () => {
    const camera = worldCamera(1280, 640);
    expect(camera.params.sourceUnits).toBeUndefined();
    expect(camera.params.keyboardDepth).toBeUndefined();
    expect(camera.sourceX(640 + 47)).toBe(23.5);
    expect(camera.near).toEqual({ y: 22, z: 142 });
  });
});
