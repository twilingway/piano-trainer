import { Matrix4, Quaternion, Vector3 } from "three";
import type { Bone, Object3D } from "three";
import type { Hand } from "../../fingering/fingering";
import { at, rootRotation } from "./handSolver/mech";
import type { Root, Vec3 } from "./handSolver/mech";
import { STUDIO_FRAME } from "./handSolver/rest";
import { KIT_DEPTH, KIT_TOP, KIT_WHITE } from "./pianoKit";

export const BONE_AXIS = new Vector3(0, 1, 0);
/** Blender (Z up, keys towards +Y) to glTF (Y up). */
export const SOLVER_TO_GLTF = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
export const solverPoint = (v: Vec3): Vector3 => new Vector3(v[0], v[2], -v[1]);

/** A solver millimetre follows the same axis scale as the physical key mesh. */
export function handSpaceLayout(space: Object3D, c4: number, white: number, hand: Hand): void {
  space.scale.set(((hand === "left" ? -1 : 1) * white) / KIT_WHITE, 1000, KIT_DEPTH);
  space.position.set(c4, KIT_TOP, 0);
}

/** Studio armature (Blender units/axes) to the solver's world (millimetres). */
export function armToWorld(root: Root): { m: readonly Vec3[]; t: Vec3 } {
  const R = rootRotation(root);
  const { F, w, S } = STUDIO_FRAME;
  const row = (r: Vec3): Vec3 => {
    const col = (j: 0 | 1 | 2) => S * (r[0] * F[0][j] + r[1] * F[1][j] + r[2] * F[2][j]);
    return [col(0), col(1), col(2)];
  };
  const m = [row(R[0]), row(R[1]), row(R[2])];
  const off = m.map((r) => r[0] * w[0] + r[1] * w[1] + r[2] * w[2]);
  return { m, t: [root[3] - at(off, 0), root[4] - at(off, 1), root[5] - at(off, 2)] };
}

/** Bone transforms in a common rig frame, independent of its scene placement. */
export class BoneFrame {
  constructor(readonly rig: Object3D) {}

  private matrix(bone: Object3D): Matrix4 {
    return new Matrix4().copy(this.rig.matrixWorld).invert().multiply(bone.matrixWorld);
  }

  turn(bone: Object3D): Quaternion {
    const turn = new Quaternion();
    this.matrix(bone).decompose(new Vector3(), turn, new Vector3());
    return turn;
  }

  head(bone: Object3D): Vector3 {
    return new Vector3().setFromMatrixPosition(this.matrix(bone));
  }

  setTurn(bone: Bone, turn: Quaternion): void {
    const parent = this.turn(bone).multiply(bone.quaternion.clone().invert());
    bone.quaternion.copy(parent.invert().multiply(turn));
    bone.updateMatrixWorld(true);
  }

  /** The shortest swing that points a bone's local +Y at a rig-frame target. */
  aim(bone: Bone, target: Vector3): void {
    const turn = this.turn(bone);
    const along = BONE_AXIS.clone().applyQuaternion(turn);
    const want = target.clone().sub(this.head(bone)).normalize();
    this.setTurn(bone, new Quaternion().setFromUnitVectors(along, want).multiply(turn));
  }

  /** Roll around local +Y until a calibrated local axis meets a rig-frame plane normal. */
  alignAxis(bone: Bone, localAxis: Vector3, normal: Vector3): void {
    const turn = this.turn(bone);
    const along = BONE_AXIS.clone().applyQuaternion(turn);
    const have = localAxis.clone().applyQuaternion(turn);
    const want = normal.clone();
    have.addScaledVector(along, -have.dot(along));
    want.addScaledVector(along, -want.dot(along));
    if (have.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
    have.normalize();
    want.normalize();
    const angle = Math.atan2(have.clone().cross(want).dot(along), have.dot(want));
    this.setTurn(bone, new Quaternion().setFromAxisAngle(along, angle).multiply(turn));
  }
}

/** Keep the studio forearm behind the wrist, carrying its twist without wringing the skin. */
export function aimForearm(
  frame: BoneFrame,
  arm: Bone,
  wrist: Bone,
  wristRest: Quaternion,
  wristOnArm: number
): void {
  const turn = new Quaternion();
  frame.rig.matrix.decompose(new Vector3(), turn, new Vector3());
  const hand = BONE_AXIS.clone().applyQuaternion(wrist.quaternion).applyQuaternion(turn);
  hand.y = 0;
  const along = hand
    .normalize()
    .lerp(new Vector3(0, 0, -1), 0.5)
    .normalize()
    .setY(0.1)
    .normalize()
    .applyQuaternion(turn.invert());
  const rest = wrist.quaternion.clone().multiply(wristRest.clone().invert());
  const axis = BONE_AXIS.clone().applyQuaternion(rest);
  arm.quaternion.copy(rest).premultiply(new Quaternion().setFromUnitVectors(axis, along));
  arm.position.copy(wrist.position).addScaledVector(along, -wristOnArm);
  arm.updateMatrixWorld(true);
}
