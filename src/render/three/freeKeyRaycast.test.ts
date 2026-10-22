import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2
} from "three";
import { describe, expect, it, vi } from "vitest";
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
      roadCamera: camera,
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
    // Metric 3D keys no longer match the Pixi layout, so the road camera picks them too.
    context.freeEnabled = false;
    expect(hit()).toBe(60);
  });

  it("picks through live hands and an attached pianist in the road camera", () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 10000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const keys = new Group();
    const material = new MeshBasicMaterial();
    const geometry = new BoxGeometry(50, 20, 20);
    const mesh = new Mesh(geometry, material);
    const hand = new Mesh(geometry, material);
    hand.position.z = 50;
    keys.add(mesh, hand);
    const body = new Mesh(geometry, material);
    body.position.z = 100;
    const context = {
      keys,
      scene: keys,
      roadCamera: camera,
      hinged: [{ pitch: 60, mesh }],
      occluders: [],
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      free: { invalidate: vi.fn() },
      performance: { invalidate: vi.fn() },
      worldStage: { invalidate: vi.fn() }
    };
    ThreeStage.prototype.addToKeys.call(context as unknown as ThreeStage, body);
    expect(context.occluders).toEqual([]);
    expect(
      ThreeStage.prototype.freeKeyAt.call(context as unknown as ThreeStage, 400, 400, 800, 800)
    ).toBe(60);
    ThreeStage.prototype.removeFromKeys.call(context as unknown as ThreeStage, body);
    expect(body.parent).toBeNull();
    geometry.dispose();
    material.dispose();
  });
});
