import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute
} from "three";
import { describe, expect, it, vi } from "vitest";
import { NativeHandsView } from "./NativeHandsView";

function model(indexed = true) {
  const scene = new Group(),
    wrist = new Bone(),
    forearm = new Bone(),
    torso = new Bone();
  wrist.name = "wrist.L";
  forearm.name = "lowerarm02.R";
  torso.name = "spine01";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Array<number>(27).fill(0), 3));
  const indices = [],
    weights = [];
  for (const bone of [0, 0, 0, 1, 1, 1, 2, 2, 2]) {
    indices.push(bone, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  geometry.morphAttributes.position = [geometry.getAttribute("position").clone()];
  if (indexed) geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 6, 1);
  const body = new SkinnedMesh(geometry);
  body.name = "PianistBody";
  body.add(wrist, forearm, torso);
  body.bind(new Skeleton([wrist, forearm, torso]));
  const meshes = [
    "AnatomicalNail_1_L",
    "Black_TopHat_Brim",
    "PersonalHead_UV",
    "bench.001",
    "Aristocratic_Coat"
  ].map((name) => {
    const mesh = new Mesh();
    mesh.name = name;
    return mesh;
  });
  const hidden = new Mesh();
  hidden.name = "AnatomicalNail_2_L";
  hidden.visible = false;
  scene.add(body, ...meshes, hidden);
  return { scene, body, geometry, meshes, hidden, wrist };
}

describe("native hands view", () => {
  it.each([true, false])(
    "cuts indexed=%s skin while retaining groups, morphs, bones and nails",
    (indexed) => {
      const { scene, body, geometry, meshes, hidden, wrist } = model(indexed);
      const skeleton = body.skeleton,
        view = new NativeHandsView(scene);
      view.showHands();
      const hands = body.geometry;
      expect(Array.from(hands.index?.array ?? [])).toEqual([0, 1, 2, 3, 4, 5]);
      expect(hands.groups).toEqual([
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 }
      ]);
      expect(hands.morphAttributes.position?.[0]?.count).toBe(9);
      expect(body.skeleton).toBe(skeleton);
      expect(wrist.visible).toBe(true);
      expect(meshes.map((mesh) => mesh.visible)).toEqual([true, false, false, false, false]);
      expect(hidden.visible).toBe(false);
      view.restore();
      expect(body.geometry).toBe(geometry);
      expect(meshes.every((mesh) => mesh.visible)).toBe(true);
      expect(hidden.visible).toBe(false);
      view.showHands();
      expect(body.geometry).toBe(hands);
      const disposeHands = vi.spyOn(hands, "dispose"),
        disposeOriginal = vi.spyOn(geometry, "dispose");
      view.dispose();
      expect(body.geometry).toBe(geometry);
      expect(disposeHands).toHaveBeenCalledOnce();
      expect(disposeOriginal).not.toHaveBeenCalled();
    }
  );

  it("hides an incompatible body instead of leaving its whole geometry visible", () => {
    const { scene, body } = model();
    body.geometry.deleteAttribute("skinWeight");
    const view = new NativeHandsView(scene);
    view.showHands();
    expect(body.visible).toBe(false);
    view.restore();
    expect(body.visible).toBe(true);
    view.dispose();
  });

  it("recognizes GLTFLoader-sanitized bones and multi-primitive nail children", () => {
    const { scene, body, wrist } = model();
    wrist.name = "wristL";
    const forearm = body.skeleton.bones[1];
    if (forearm) forearm.name = "lowerarm02R";
    const nail = new Group();
    nail.name = "AnatomicalNail_2_R";
    const surfaces = ["AnatomicalNailSurface_2_R", "AnatomicalNailSurface_2_R_1", "primitive"].map(
      (name) => {
        const mesh = new Mesh();
        mesh.name = name;
        return mesh;
      }
    );
    nail.add(...surfaces);
    scene.add(nail);
    const view = new NativeHandsView(scene);
    view.showHands();
    expect(body.visible).toBe(true);
    expect(Array.from(body.geometry.index?.array ?? [])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(surfaces.every((surface) => surface.visible)).toBe(true);
    view.dispose();
  });
});
