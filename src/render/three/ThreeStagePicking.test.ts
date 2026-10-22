import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
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
