import { Vector3 } from "three";
import type { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { DEFAULT_CAMERA, keySurface, worldCamera } from "../worldCamera";
import { keyBoxes } from "./keyBoxes";
import { projectionMatrix, viewMatrix } from "./threeCamera";

const WIDTH = 1280;
const HEIGHT = 720;

function scene(pan: number, prefs = DEFAULT_CAMERA): KeysScene {
  const keys = layoutKeyboard(1600, 48, 84);
  const blackHeight = 60;
  return {
    faces: [...keys.values()].map((key) => ({
      key,
      source: key.black ? { y: 0, height: blackHeight } : { y: blackHeight, height: 40 }
    })),
    texture: { width: 1600, height: 100 } as Texture,
    camera: worldCamera(WIDTH, 640, prefs),
    pan,
    offset: { x: 0, y: 0 },
    version: 1
  };
}

describe("3D key boxes", () => {
  it.each([
    [0, DEFAULT_CAMERA],
    [160, DEFAULT_CAMERA],
    [90, { ...DEFAULT_CAMERA, pitch: 45, scale: 1.4, fov: 30 }]
  ])("puts every top face where the perspective keys draw it (pan %s)", (pan, prefs) => {
    const keys = scene(pan, prefs);
    const { camera } = keys;
    const view = viewMatrix(camera.params);
    const projection = projectionMatrix(camera.params, WIDTH, HEIGHT);
    const s = prefs.scale;
    const boxes = keyBoxes(keys);
    expect(boxes).toHaveLength(keys.faces.length);
    for (const [index, box] of boxes.entries()) {
      const face = keys.faces[index];
      if (!face) throw new Error("missing face");
      const { key } = face;
      const expected = keySurface(
        camera,
        camera.sourceX(key.x + key.width / 2 - pan),
        key.black,
        key.width
      ).top;
      const half = box.width / 2;
      // Back left, back right, front right, front left, as `keySurface` lists them.
      const corners: [number, number][] = [
        [box.x - half, box.back],
        [box.x + half, box.back],
        [box.x + half, box.front],
        [box.x - half, box.front]
      ];
      for (const [corner, [x, z]] of corners.entries()) {
        // The keys' group: scaled, and shifted by the scroll.
        const ndc = new Vector3((x - pan / 2) * s, box.top * s, -z * s)
          .applyMatrix4(view)
          .applyMatrix4(projection);
        const want = expected[corner];
        if (!want) throw new Error("missing corner");
        expect(((ndc.x + 1) * WIDTH) / 2).toBeCloseTo(want.x, 0.5);
        expect(((1 - ndc.y) * HEIGHT) / 2).toBeCloseTo(want.y, 0.5);
      }
    }
  });

  it("maps the top faces onto the keys' rects in the texture", () => {
    const boxes = keyBoxes(scene(0));
    const c4 = boxes.find((box) => box.pitch === 60);
    const cSharp = boxes.find((box) => box.pitch === 61);
    expect(c4?.uv.v0).toBeCloseTo(0.6);
    expect(c4?.uv.v1).toBeCloseTo(1);
    expect(cSharp?.uv.v0).toBe(0);
    expect(cSharp?.uv.v1).toBeCloseTo(0.6);
    expect(c4 && c4.uv.u1 > c4.uv.u0).toBe(true);
  });
});
