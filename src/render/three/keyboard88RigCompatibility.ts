import { Bone, Matrix4, Quaternion, SkinnedMesh, Vector3 } from "three";
import type { Object3D } from "three";
import { keyboard88At } from "./keyboard88Bones";
import type { Keyboard88Rig } from "./keyboard88Bones";

// glTF inverse binds are float32; the atlas rest transforms retain float64 precision.
const MATRIX_TOLERANCE = 1e-5;
const MIN_DETERMINANT = 1e-12;

function invertible(matrix: Matrix4, field: string): void {
  const determinant = matrix.determinant();
  if (
    !matrix.elements.every(Number.isFinite) ||
    !Number.isFinite(determinant) ||
    Math.abs(determinant) < MIN_DETERMINANT
  )
    throw new Error(`keyboard88 invalid ${field} transform`);
}

function sameMatrix(actual: Matrix4, expected: Matrix4, field: string): void {
  invertible(actual, field);
  if (
    actual.elements.some(
      (value, i) => Math.abs(value - keyboard88At(expected.elements, i)) > MATRIX_TOLERANCE
    )
  )
    throw new Error(`keyboard88 incompatible ${field} transform`);
}

/** Validate the exported glTF rest/bind profile before applying atlas rotations. */
export function validateKeyboard88RigCompatibility(scene: Object3D, rig: Keyboard88Rig): void {
  if (rig.rootMatrix.length !== 16) throw new Error("keyboard88 invalid root transform");
  const root = new Matrix4().fromArray(rig.rootMatrix);
  invertible(root, "root");
  scene.updateMatrixWorld(true);
  const named = new Map<string, Bone>();
  const expectedNames = new Set(rig.boneNames);
  const meshes: SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof Bone && expectedNames.has(node.name)) {
      if (named.has(node.name)) throw new Error("keyboard88 duplicate rig bone");
      named.set(node.name, node as Bone);
    }
    if (node instanceof SkinnedMesh) meshes.push(node as SkinnedMesh);
  });
  if (meshes.length === 0) throw new Error("keyboard88 GLB is not skinned");
  const bones = rig.boneNames.map((name) => {
    const bone = named.get(name);
    if (!bone) throw new Error(`keyboard88 missing rig bone ${name}`);
    return bone;
  });
  const expected = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  for (const [i, bone] of bones.entries()) {
    const parent = keyboard88At(rig.parents, i);
    if (parent < 0) {
      if (!bone.parent || bone.parent instanceof Bone)
        throw new Error("keyboard88 incompatible root bone parent");
      sameMatrix(bone.parent.matrixWorld, root, "root");
    } else if (bone.parent !== keyboard88At(bones, parent)) {
      throw new Error("keyboard88 incompatible bone parent");
    }
    const rest = keyboard88At(rig.rest, i);
    expected.compose(
      position.fromArray(rest.position),
      rotation.fromArray(rest.quaternion),
      scale.fromArray(rest.scale)
    );
    invertible(expected, "atlas rest");
    sameMatrix(bone.matrix, expected, "bone rest");
    invertible(bone.matrixWorld, "bone world");
  }
  const identity = new Matrix4();
  for (const mesh of meshes) {
    if (mesh.bindMode !== "attached") throw new Error("keyboard88 incompatible bind mode");
    const skeleton = mesh.skeleton;
    if (
      skeleton.bones.length !== bones.length ||
      skeleton.boneInverses.length !== bones.length ||
      skeleton.bones.some((bone, i) => bone !== bones[i])
    )
      throw new Error("keyboard88 incompatible skeleton bone order");
    // The atlas exporter puts the armature root on both the mesh and skeleton ancestors.
    sameMatrix(mesh.matrixWorld, root, "mesh root");
    sameMatrix(mesh.bindMatrix, identity, "bind");
    for (const [i, bone] of bones.entries()) {
      // glTF inverse binds are relative to the mesh, not absolute scene-space FK.
      expected.copy(bone.matrixWorld).invert().multiply(mesh.matrixWorld);
      sameMatrix(keyboard88At(skeleton.boneInverses, i), expected, "inverse bind");
    }
  }
}
