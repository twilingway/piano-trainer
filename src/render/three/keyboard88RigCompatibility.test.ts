import {
  Bone,
  BufferGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3
} from "three";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { validateKeyboard88RigCompatibility } from "./keyboard88RigCompatibility";
import type { Keyboard88Rig } from "./keyboard88Bones";

function at<T>(values: readonly T[], i: number): T {
  const value = values[i];
  if (value === undefined) throw new Error("Missing test item");
  return value;
}

function fixture() {
  const scene = new Group();
  const root = new Group();
  root.position.set(0.21, 0.04, 1.36);
  root.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  root.scale.setScalar(0.9);
  scene.add(root);
  const bones = ["Pelvis", "Spine", "Wrist"].map((name, i) => {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(0.03 * i, 0.11 * i, -0.02);
    bone.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.1 * i);
    return bone;
  });
  root.add(at(bones, 0));
  at(bones, 0).add(at(bones, 1));
  at(bones, 1).add(at(bones, 2));
  scene.updateMatrixWorld(true);
  const skeleton = new Skeleton(
    bones,
    bones.map((bone) => new Matrix4().copy(bone.matrixWorld).invert().multiply(root.matrixWorld))
  );
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  root.add(mesh);
  mesh.bind(skeleton, new Matrix4());
  scene.updateMatrixWorld(true);
  const rig: Keyboard88Rig = {
    boneNames: bones.map((bone) => bone.name),
    parents: [-1, 0, 1],
    rest: bones.map((bone) => ({
      position: bone.position.toArray(),
      quaternion: bone.quaternion.toArray(),
      scale: bone.scale.toArray(),
      tail: [0, 0.1, 0]
    })),
    rootMatrix: root.matrixWorld.toArray()
  };
  return { scene, root, bones, skeleton, mesh, rig };
}

describe("keyboard88 rig compatibility", () => {
  it("accepts transformed roots and mesh-relative inverse binds", () => {
    const f = fixture();
    expect(() => {
      validateKeyboard88RigCompatibility(f.scene, f.rig);
    }).not.toThrow();
    // A wrong absolute-scene comparison would reject this valid glTF profile.
    expect(at(f.skeleton.boneInverses, 0).equals(at(f.bones, 0).matrixWorld.clone().invert())).toBe(
      false
    );
  });

  it("accepts float32 inverse-bind rounding", () => {
    const f = fixture();
    for (const matrix of f.skeleton.boneInverses)
      matrix.fromArray(new Float32Array(matrix.elements));
    expect(() => {
      validateKeyboard88RigCompatibility(f.scene, f.rig);
    }).not.toThrow();
  });

  it.each(["parent", "position", "rotation", "scale", "root", "mesh", "bind", "inverse bind"])(
    "rejects same names with changed %s",
    (kind) => {
      const f = fixture();
      const wrist = at(f.bones, 2);
      if (kind === "parent") f.root.add(wrist);
      if (kind === "position") wrist.position.x += 0.001;
      if (kind === "rotation") wrist.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.1);
      if (kind === "scale") wrist.scale.x = 1.01;
      if (kind === "root") f.root.position.x += 0.001;
      if (kind === "mesh") f.mesh.position.y += 0.001;
      if (kind === "bind") f.mesh.bindMatrix.makeTranslation(0.01, 0, 0);
      if (kind === "inverse bind") at(f.skeleton.boneInverses, 2).elements[12] = 0.25;
      expect(() => {
        validateKeyboard88RigCompatibility(f.scene, f.rig);
      }).toThrow("incompatible");
    }
  );

  it.each(["rest NaN", "singular rest", "inverse NaN", "singular inverse"])(
    "rejects %s without repairing the export",
    (kind) => {
      const f = fixture();
      if (kind === "rest NaN") at(f.bones, 2).position.y = NaN;
      if (kind === "singular rest") at(f.bones, 2).scale.x = 0;
      if (kind === "inverse NaN") at(f.skeleton.boneInverses, 2).elements[5] = NaN;
      if (kind === "singular inverse") at(f.skeleton.boneInverses, 2).makeScale(0, 1, 1);
      expect(() => {
        validateKeyboard88RigCompatibility(f.scene, f.rig);
      }).toThrow("invalid");
    }
  );

  it("rejects detached binding that would stop cancelling the mesh root", () => {
    const f = fixture();
    f.mesh.bindMode = "detached";
    expect(() => {
      validateKeyboard88RigCompatibility(f.scene, f.rig);
    }).toThrow("bind mode");
  });
  it("rejects duplicate named bones outside the skin skeleton", () => {
    const f = fixture();
    const duplicate = new Bone();
    duplicate.name = "Wrist";
    f.scene.add(duplicate);
    expect(() => {
      validateKeyboard88RigCompatibility(f.scene, f.rig);
    }).toThrow("duplicate");
  });

  it("rejects a missing bone and a reordered skin skeleton", () => {
    const f = fixture();
    at(f.bones, 2).removeFromParent();
    expect(() => {
      validateKeyboard88RigCompatibility(f.scene, f.rig);
    }).toThrow("missing");
    const reordered = fixture();
    reordered.skeleton.bones.reverse();
    expect(() => {
      validateKeyboard88RigCompatibility(reordered.scene, reordered.rig);
    }).toThrow("bone order");
  });

  it("accepts the real published GLB and atlas without rewriting them", async () => {
    const base = new URL("../../../public/models/", import.meta.url);
    const data = JSON.parse(await readFile(new URL("keyboard88-atlas.json", base), "utf8")) as {
      boneNames: string[];
      bones: {
        parent: number;
        translation: number[];
        rotation: number[];
        scale: number[];
        tail: number[];
      }[];
      root: { translation: number[]; rotation: number[]; scale: number[] };
    };
    const bytes = await readFile(new URL("keyboard88-performer.glb", base));
    const parsed = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
    const rig: Keyboard88Rig = {
      boneNames: data.boneNames,
      parents: data.bones.map((bone) => bone.parent),
      rest: data.bones.map((bone) => ({
        position: bone.translation,
        quaternion: bone.rotation,
        scale: bone.scale,
        tail: bone.tail
      })),
      rootMatrix: new Matrix4()
        .compose(
          new Vector3().fromArray(data.root.translation),
          new Quaternion().fromArray(data.root.rotation),
          new Vector3().fromArray(data.root.scale)
        )
        .toArray()
    };
    expect(() => {
      validateKeyboard88RigCompatibility(parsed.scene, rig);
    }).not.toThrow();
  });
});
