import {
  Camera,
  Scene,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3
} from "three";
import { describe, expect, it } from "vitest";
import { readingDisplayProfile } from "../app/readingProfile";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import {
  fittedNativeKeyboardCamera,
  nativeKeyboardFootprint,
  naturalNativeKeyboardHeight
} from "./nativeKeyboardFraming";
import { USUAL_PLACEMENT, viewGeometry } from "./viewGeometry";
import { viewMatrix, projectionMatrix } from "./three/threeCamera";
import { pickKeyboardKey } from "./three/pickKeyboardKey";

describe("beginner keyboard viewport balance", () => {
  it.each([
    [1920, 1080],
    [1366, 768],
    [390, 844],
    [667, 375]
  ])("keeps the physical keys and white/black picking usable at %s×%s", (width, height) => {
    const prefs = readingDisplayProfile(DEFAULT_STAFF_PREFS, true);
    const layout = layoutKeyboard(width, 60, 72);
    const base = metricKeyboardCamera(
      width,
      width,
      height,
      prefs.camera,
      0.1,
      layout.values(),
      true
    );
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
    const footprint = nativeKeyboardFootprint(fitted);
    const whiteWidth = fitted.project(23.5, 22, 0).x - fitted.project(0, 22, 0).x;
    expect(footprint.height).toBeLessThanOrEqual(height * 0.3 + 1e-6);
    expect(height - geometry.hitY).toBeLessThanOrEqual(height * 0.35);
    expect(whiteWidth).toBeGreaterThanOrEqual(30);
    expect(fitted.params.keyboardDepth).toBe(150);
    const camera = new Camera();
    camera.matrixAutoUpdate = false;
    camera.matrix.copy(viewMatrix(fitted.params)).invert();
    camera.matrixWorldNeedsUpdate = true;
    camera.projectionMatrix.copy(projectionMatrix(fitted.params, width, height));
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const scene = new Scene();
    const white = new Mesh(new BoxGeometry(23.5, 22, 150), new MeshBasicMaterial());
    white.position.set(0, 11, -75);
    const black = new Mesh(new BoxGeometry(13.3, 12, 94), new MeshBasicMaterial());
    black.position.set(11.75, 28, -102);
    scene.add(white, black);
    camera.updateMatrixWorld(true);
    try {
      for (const [point, pitch] of [
        [new Vector3(0, 22, 20), 60],
        [new Vector3(11.75, 34, 100), 61]
      ] as const) {
        const pixel = fitted.project(point.x, point.y, point.z);
        const rendered = new Vector3(point.x, point.y, -point.z).project(camera);
        expect(((rendered.x + 1) * width) / 2).toBeCloseTo(pixel.x, 6);
        expect(((1 - rendered.y) * height) / 2).toBeCloseTo(pixel.y, 6);
        expect(
          pickKeyboardKey(
            new Raycaster(),
            new Vector2(),
            scene,
            [
              { pitch: 60, mesh: white },
              { pitch: 61, mesh: black }
            ],
            [],
            camera,
            pixel.x,
            pixel.y,
            width,
            height
          )
        ).toBe(pitch);
      }
    } finally {
      for (const mesh of [white, black]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  });
});
