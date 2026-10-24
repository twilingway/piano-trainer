import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3
} from "three";
import { ThreeStage } from "./ThreeStage";

function setup(performance: boolean) {
  const scene = new Scene();
  const white = new Mesh(new BoxGeometry(2, 0.3, 3), new MeshBasicMaterial());
  const black = new Mesh(new BoxGeometry(0.6, 0.3, 1.4), new MeshBasicMaterial());
  black.position.set(-0.3, 0.3, -0.6);
  scene.add(white, black);
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const unused = new PerspectiveCamera();
  unused.position.set(100, 100, 100);
  unused.lookAt(100, 0, 100);
  unused.updateMatrixWorld();
  const stage = Object.assign(Object.create(ThreeStage.prototype) as object, {
    scene,
    freeEnabled: !performance,
    performanceEnabled: performance,
    free: { camera: performance ? unused : camera },
    performance: { camera: performance ? camera : unused },
    pickCamera: camera,
    pointer: new Vector2(),
    raycaster: new Raycaster(),
    occluders: [],
    hinged: [
      { pitch: 60, mesh: white, hinge: new Group() },
      { pitch: 61, mesh: black, hinge: new Group() }
    ]
  }) as unknown as ThreeStage;
  const pick = (point: Vector3) => {
    const ndc = point.project(camera);
    return stage.freeKeyAt((ndc.x + 1) * 400, (1 - ndc.y) * 400, 800, 800);
  };
  const dispose = () => {
    for (const mesh of [white, black]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  };
  return { pick, stage, dispose };
}
describe("effective scene camera mesh picking", () => {
  it.each([false, true])(
    "picks visible white and raised black keys with performance=%s",
    (performance) => {
      const test = setup(performance);
      expect(test.pick(new Vector3(0.65, 0.15, 0.8))).toBe(60);
      expect(test.pick(new Vector3(-0.3, 0.45, -0.6))).toBe(61);
      test.dispose();
    }
  );
  it("picks the physical keyboard in the normal camera after leaving the scene camera", () => {
    const test = setup(true);
    Object.assign(test.stage, { performanceEnabled: false, freeEnabled: false });
    expect(test.pick(new Vector3(0.65, 0.15, 0.8))).toBe(60);
    test.dispose();
  });
});

it("picks the real key mesh after standard-camera depth fitting at both heights", async () => {
  const { metricKeyboardCamera } = await import("../metricKeyboardCamera");
  const { nativeViewCameras } = await import("../nativeViewCameras");
  const { layoutKeyboard } = await import("../keyboardLayout");
  const { CAMERA_PRESETS } = await import("../worldCamera");
  const { viewMatrix, projectionMatrix } = await import("./threeCamera");
  const width = 1366,
    height = 768;
  const scene = new Scene();
  const white = new Mesh(new BoxGeometry(22.5, 22, 150), new MeshBasicMaterial());
  white.position.set(0, 11, -75);
  const black = new Mesh(new BoxGeometry(13.3, 12, 94), new MeshBasicMaterial());
  black.position.set(11.75, 28, -102);
  scene.add(white, black);
  const camera = new Camera();
  camera.matrixAutoUpdate = false;
  const stage = Object.assign(Object.create(ThreeStage.prototype) as object, {
    scene,
    freeEnabled: false,
    performanceEnabled: false,
    pickCamera: camera,
    pointer: new Vector2(),
    raycaster: new Raycaster(),
    occluders: [],
    hinged: [
      { pitch: 60, mesh: white, hinge: new Group() },
      { pitch: 61, mesh: black, hinge: new Group() }
    ]
  }) as unknown as ThreeStage;
  try {
    for (const preset of [CAMERA_PRESETS.top, CAMERA_PRESETS.player])
      for (const wanted of [60, 240]) {
        const keys = layoutKeyboard(2288, 48, 84);
        const base = metricKeyboardCamera(width, 2288, height, preset, 0.1, keys.values());
        const { keyboard } = nativeViewCameras(
          base,
          wanted,
          false,
          true,
          height,
          0.1,
          height,
          height - 16
        );
        camera.matrix.copy(viewMatrix(keyboard.params)).invert();
        camera.matrixWorldNeedsUpdate = true;
        camera.projectionMatrix.copy(projectionMatrix(keyboard.params, width, height));
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        scene.scale.setScalar(keyboard.params.prefs.scale);
        for (const [point, pitch] of [
          [new Vector3(0, 22, 20), 60],
          [new Vector3(11.75, 34, 100), 61]
        ] as const) {
          camera.updateMatrixWorld(true);
          const pixel = keyboard.project(point.x, point.y, point.z);
          const rendered = new Vector3(point.x, point.y, -point.z)
            .multiplyScalar(keyboard.params.prefs.scale)
            .project(camera);
          expect(((rendered.x + 1) * width) / 2).toBeCloseTo(pixel.x, 6);
          expect(((1 - rendered.y) * height) / 2).toBeCloseTo(pixel.y, 6);
          expect(stage.freeKeyAt(pixel.x, pixel.y, width, height)).toBe(pitch);
        }
      }
  } finally {
    for (const mesh of [white, black]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
});
