import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute
} from "three";
import { describe, expect, it, vi } from "vitest";
import { bindKeyboard88RoadBody, keyboard88UpperBodyIndices } from "./keyboard88RoadBody";

function fixture() {
  const geometry = new BufferGeometry();
  geometry.userData.role = "body";
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(15 * 3), 3));
  const names = ["m_avg_Spine1", "m_avg_Pelvis", "m_avg_L_Hip", "m_avg_R_Foot"];
  // Torso, pelvis, thigh, foot, then the mixed pelvis/spine boundary.
  const joints = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 1, 0, 0];
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(
      joints.flatMap((bone) => [bone, 0, 0, 0]),
      4
    )
  );
  const weights = joints.flatMap(() => [1, 0, 0, 0]);
  weights[12 * 4] = 0.5;
  weights[12 * 4 + 1] = 0.5;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  geometry.setIndex(Array.from({ length: 15 }, (_, i) => i));
  const material = new MeshBasicMaterial();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.bind(new Skeleton(names.map((name) => Object.assign(new Bone(), { name }))));
  const scene = new Group();
  scene.add(mesh);
  return { geometry, names, mesh, scene, material };
}

describe("keyboard88 lower body in separate road views", () => {
  it("omits hips, legs and feet including a boundary triangle without changing the full index", () => {
    const f = fixture();
    expect(keyboard88UpperBodyIndices(f.geometry, f.names)).toEqual([0, 1, 2]);
    expect(Array.from(f.geometry.getIndex()?.array ?? [])).toEqual(
      Array.from({ length: 15 }, (_, i) => i)
    );
    const weights = f.geometry.getAttribute("skinWeight");
    weights.setXY(12, 0.49, 0.51);
    expect(keyboard88UpperBodyIndices(f.geometry, f.names)).toEqual([0, 1, 2, 12, 13, 14]);
  });

  it("restores the full model for shared/free/performance cameras and disposes its cached copy", () => {
    const f = fixture();
    const hand = new SkinnedMesh(f.geometry.clone(), f.material);
    // BufferGeometry.clone shares userData by reference; the hand needs its own.
    hand.geometry.userData = { role: "rightHand" };
    hand.bind(f.mesh.skeleton);
    f.scene.add(hand);
    const handGeometry = hand.geometry;
    const fullIndex = f.geometry.getIndex();
    const binding = bindKeyboard88RoadBody(f.scene);
    binding.setSeparateCameras(true);
    const road = f.mesh.geometry;
    const dispose = vi.spyOn(road, "dispose");
    expect(Array.from(road.getIndex()?.array ?? [])).toEqual([0, 1, 2]);
    expect(hand.geometry).toBe(handGeometry);
    expect(f.scene.children).toHaveLength(2);
    expect(f.mesh.visible).toBe(true);
    f.mesh.visible = false;
    for (let i = 0; i < 3; i++) {
      binding.setSeparateCameras(false);
      expect(f.mesh.geometry).toBe(f.geometry);
      expect(f.mesh.geometry.getIndex()).toBe(fullIndex);
      binding.setSeparateCameras(true);
      expect(f.mesh.geometry).toBe(road);
    }
    expect(f.mesh.visible).toBe(false);
    binding.dispose();
    binding.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.mesh.geometry).toBe(f.geometry);
    binding.setSeparateCameras(true);
    expect(f.mesh.geometry).toBe(f.geometry);
  });
});
