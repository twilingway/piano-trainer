import { BoxGeometry, Camera, Group, Mesh, MeshBasicMaterial, PointLight, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { drawDockedScenePasses, invalidateDockedScenePasses } from "./dockedScenePasses";

function fixture() {
  const scene = new Scene(),
    road = new Group(),
    keys = new Group(),
    decorations = new Group();
  const material = new MeshBasicMaterial({ transparent: true });
  const geometry = new BoxGeometry();
  const make = (parent: Group, name: string) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  make(road, "note");
  make(keys, "key");
  make(keys, "case");
  make(decorations, "platform");
  const fx = new Group();
  fx.userData.cameraCompositionRole = "keyboard";
  decorations.add(fx);
  make(fx, "key-fire");
  const hidden = make(decorations, "hidden");
  hidden.visible = false;
  scene.add(road, keys, decorations, new PointLight());
  const world = new Camera(),
    keyboard = new Camera();
  const seen: { camera: Camera; names: string[] }[] = [];
  const renderer = {
    clearDepth: vi.fn(),
    render: vi.fn((_scene: Scene, camera: Camera) => {
      const names: string[] = [];
      scene.traverseVisible((object) => {
        if (object instanceof Mesh) names.push(object.name);
      });
      seen.push({ camera, names });
    })
  };
  const draw = () => {
    drawDockedScenePasses(renderer, scene, road, keys, world, keyboard);
  };
  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  return { scene, road, keys, decorations, world, keyboard, seen, renderer, draw, dispose, hidden };
}
describe("docked camera ownership", () => {
  it("draws transparent world scenery once and key effects once in their displayed cameras", () => {
    const f = fixture();
    f.draw();
    expect(f.seen).toEqual([
      { camera: f.world, names: ["note", "platform"] },
      { camera: f.keyboard, names: ["key", "case", "key-fire"] }
    ]);
    expect(f.renderer.clearDepth).toHaveBeenCalledOnce();
    expect(f.hidden.visible).toBe(false);
    f.dispose();
  });
  it.each([1, 2])("restores original visibility when pass %s fails", (failure) => {
    const f = fixture();
    let calls = 0;
    f.renderer.render.mockImplementation(() => {
      if (++calls === failure) throw new Error("draw failed");
    });
    expect(f.draw).toThrow("draw failed");
    const visible: string[] = [];
    f.scene.traverseVisible((object) => {
      if (object instanceof Mesh) visible.push(object.name);
    });
    expect(visible).toEqual(["note", "key", "case", "platform", "key-fire"]);
    expect(f.hidden.visible).toBe(false);
    f.dispose();
  });
  it("keeps key effects with hidden physical keys and refreshes membership after attachment", () => {
    const f = fixture();
    f.keys.visible = false;
    f.draw();
    expect(f.seen[1]?.names).toEqual(["key-fire"]);
    const extra = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    extra.name = "new-body";
    f.keys.add(extra);
    f.keys.visible = true;
    invalidateDockedScenePasses(f.scene);
    f.draw();
    expect(f.seen[3]?.names).toEqual(["key", "case", "new-body", "key-fire"]);
    extra.geometry.dispose();
    extra.material.dispose();
    f.dispose();
  });
});

it("refreshes camera membership when lazy road or score meshes attach after a frame", () => {
  const f = fixture();
  f.draw();
  const group = new Group();
  const note = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  note.name = "lazy-note";
  group.add(note);
  f.road.add(group);
  f.draw();
  expect(f.seen[2]?.names).toContain("lazy-note");
  expect(f.seen[3]?.names).not.toContain("lazy-note");
  const score = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  score.name = "score-tile";
  f.decorations.add(score);
  f.draw();
  expect(f.seen[4]?.names).toContain("score-tile");
  expect(f.seen[5]?.names).not.toContain("score-tile");
  for (const mesh of [note, score]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  f.dispose();
});
