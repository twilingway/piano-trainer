import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2
} from "three";
import { describe, expect, it } from "vitest";
import { ThreeStage } from "./ThreeStage";

describe("free camera physical keyboard hits", () => {
  it("hits transformed key meshes and rejects keys behind the piano body", () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 10000);
    camera.position.set(100, 30, 300);
    camera.lookAt(100, 0, 0);
    camera.updateMatrixWorld();
    const keys = new Group();
    keys.position.x = 100;
    const mesh = new Mesh(new BoxGeometry(50, 20, 80), new MeshBasicMaterial());
    keys.add(mesh);
    keys.updateMatrixWorld(true);
    const context = {
      freeEnabled: true,
      free: { camera },
      keys,
      scene: keys,
      hinged: [{ pitch: 60, mesh }],
      occluders: [] as Mesh[],
      raycaster: new Raycaster(),
      pointer: new Vector2()
    };
    const hit = () =>
      ThreeStage.prototype.freeKeyAt.call(context as unknown as ThreeStage, 400, 400, 800, 800);
    expect(hit()).toBe(60);
    const body = new Mesh(new BoxGeometry(200, 100, 20), new MeshBasicMaterial());
    body.position.z = 100;
    keys.add(body);
    context.occluders.push(body);
    expect(hit()).toBeUndefined();
    body.visible = false;
    expect(hit()).toBe(60);
    const shadow = new Mesh(
      new BoxGeometry(60, 60, 10),
      new MeshBasicMaterial({ transparent: true, opacity: 0.1 })
    );
    shadow.position.z = 150;
    keys.add(shadow);
    expect(hit()).toBe(60);
    context.freeEnabled = false;
    expect(hit()).toBeUndefined();
  });
});
