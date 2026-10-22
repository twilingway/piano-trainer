import {
  Bone,
  Box3,
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute
} from "three";
import { describe, expect, it } from "vitest";
import { pianistActualFingerGap } from "./pianistFingerGap.testSupport";

describe("actual named finger gap diagnostics", () => {
  it.each(["index_3L", "finger2-3R", "middle_3L"])(
    "reads posed geometry for %s independently of analytic contact",
    (name) => {
      const bone = new Bone();
      bone.name = name;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute([0, 5, 0], 3));
      geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0], 4));
      geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0], 4));
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const skin = new SkinnedMesh(geometry, material);
      skin.add(bone);
      skin.bind(new Skeleton([bone]));
      const mesh = new Mesh(new BoxGeometry(10, 2, 10), material),
        hinge = new Group();
      hinge.add(mesh);
      hinge.updateMatrixWorld(true);
      const key = { pitch: 60, hinge, mesh, box: new Box3(), drop: 0 };
      if (name === "middle_3L") expect(pianistActualFingerGap(skin, key, 2)).toBe(Infinity);
      else {
        expect(pianistActualFingerGap(skin, key, 2)).toBeCloseTo(4);
        bone.position.y = -6;
        expect(pianistActualFingerGap(skin, key, 2)).toBeCloseTo(-2);
      }
      geometry.dispose();
      mesh.geometry.dispose();
      material.dispose();
      skin.skeleton.dispose();
    }
  );
});
