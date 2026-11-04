import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3
} from "three";
import { pickKeyboardKey } from "./pickKeyboardKey";
describe("logical key picking proxies", () => {
  it("preserves projected edge and shoulder hit regions and follows key travel without drawing proxies", () => {
    const scene = new Scene(),
      material = new MeshBasicMaterial();
    const original = new BoxGeometry(22.5, 22, 150);
    original.translate(0, -11, -75);
    const rounded = new BoxGeometry(12, 22, 140);
    rounded.translate(0, -11, -75);
    const mesh = new Mesh(rounded, material),
      proxy = new Mesh(original, material);
    mesh.position.set(40, 22, 0);
    scene.add(mesh);
    const camera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(0, 300, -75);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, -75);
    camera.updateMatrixWorld();
    const pointer = new Vector2(),
      ray = new Raycaster(),
      keys = [{ pitch: 60, mesh, pickMesh: proxy }];
    const pick = (x: number, z: number, y = 22) => {
      const point = new Vector3(x, y, z).project(camera);
      return pickKeyboardKey(
        ray,
        pointer,
        scene,
        keys,
        [],
        camera,
        (point.x + 1) * 500,
        (1 - point.y) * 500,
        1000,
        1000
      );
    };
    for (const x of [29, 31, 40, 49, 51])
      for (const z of [-1, -50, -100, -149]) expect(pick(x, z)).toBe(60);
    expect(pick(28.5, -60)).toBeUndefined();
    expect(pick(51.5, -60)).toBeUndefined();
    expect(scene.children).toEqual([mesh]);
    mesh.position.y -= 8;
    expect(pick(51, -100, 14)).toBe(60);
    mesh.visible = false;
    expect(pick(40, -40)).toBeUndefined();
    original.dispose();
    rounded.dispose();
    material.dispose();
  });
});
