import { Matrix4, Quaternion, Vector3 } from "three";
import { Keyboard88Bones, keyboard88At as at } from "./keyboard88Bones.ts";
import type { Keyboard88Rig } from "./keyboard88Bones";
import { Keyboard88ArmIk, armVector, armRotation } from "./keyboard88ArmIk.ts";
import type { Keyboard88ArmPose, Keyboard88ArmTarget } from "./keyboard88ArmIk";

export const KEYBOARD88_MIRROR_X = 0.219;
export const KEYBOARD88_ARM_SHIFT = 0.018;

function counterpart(name: string): string {
  if (name.startsWith("m_avg_L_")) return name.replace("m_avg_L_", "m_avg_R_");
  if (name.startsWith("m_avg_R_")) return name.replace("m_avg_R_", "m_avg_L_");
  if (name.startsWith("m_avg_l")) return name.replace("m_avg_l", "m_avg_r");
  if (name.startsWith("m_avg_r")) return name.replace("m_avg_r", "m_avg_l");
  return name;
}

/** Reflection of a proper rotation by Sx, retaining a proper quaternion (Sx R Sx). */
export function reflectKeyboard88Quaternion(source: Quaternion, target: Quaternion): Quaternion {
  return target.set(source.x, -source.y, -source.z, source.w);
}

/** Replaceable right-to-left adapter. No mesh scaling, bone translation or additive body motion. */
export class Keyboard88Mirror {
  readonly skeleton: Keyboard88Bones;
  readonly mirrored: Float32Array;
  readonly rig: Keyboard88Rig;
  private readonly source: Keyboard88Bones;
  private readonly map: number[];
  private readonly shared: number[];
  private readonly left: number[];
  private readonly desired: Quaternion[];
  private readonly rootRotation: Quaternion;
  private readonly q = new Quaternion();
  private readonly other = new Quaternion();
  private readonly inverse = new Quaternion();
  private readonly arms: readonly (readonly number[])[];
  private readonly ik = new Keyboard88ArmIk();
  private readonly point = new Vector3();
  private readonly pose: Keyboard88ArmPose = {
    shoulder: armVector(),
    elbow: armVector(),
    wrist: armVector(),
    parentRotation: armRotation(),
    shoulderRotation: armRotation(),
    elbowRotation: armRotation()
  };
  private readonly targets: readonly Keyboard88ArmTarget[] = [
    { position: armVector(), rotation: armRotation(), pole: armVector() },
    { position: armVector(), rotation: armRotation(), pole: armVector() }
  ];
  /** Bit 0: right, bit 1: left. Reset on each composition, including random-access seeks. */
  unreachableMask = 0;

  constructor(rig: Keyboard88Rig) {
    this.rig = rig;
    this.skeleton = new Keyboard88Bones(rig);
    this.source = new Keyboard88Bones(rig);
    this.mirrored = new Float32Array(rig.boneNames.length * 4);
    this.map = rig.boneNames.map((name) => rig.boneNames.indexOf(counterpart(name)));
    if (this.map.some((index) => index < 0)) throw new Error("Incomplete keyboard88 side mapping");
    this.shared = ["Pelvis", "Spine1", "Spine2", "Spine3", "Neck", "Head"].map((part) =>
      rig.boneNames.indexOf(`m_avg_${part}`)
    );
    this.left = rig.boneNames
      .flatMap((name, i) => (name.startsWith("m_avg_L_") || name.startsWith("m_avg_l") ? [i] : []))
      .filter((i) => this.isArm(i));
    this.arms = ["R", "L"].map((side) =>
      ["Shoulder", "Elbow", "Wrist"].map((part) => rig.boneNames.indexOf(`m_avg_${side}_${part}`))
    );
    if ([...this.shared, ...this.arms.flat()].some((i) => i < 0))
      throw new Error("Incomplete keyboard88 torso/arm rig");
    this.desired = rig.boneNames.map(() => new Quaternion());
    this.rootRotation = new Quaternion().setFromRotationMatrix(
      new Matrix4().fromArray(rig.rootMatrix)
    );
  }

  private isArm(index: number): boolean {
    while (index >= 0) {
      if (this.rig.boneNames[index] === "m_avg_L_Collar") return true;
      index = at(this.rig.parents, index);
    }
    return false;
  }

  mirror(rotations: ArrayLike<number>): Float32Array {
    this.source.set(rotations);
    for (let i = 0; i < this.map.length; i++) {
      const from = at(this.map, i);
      this.q.setFromRotationMatrix(at(this.source.bones, from).matrixWorld);
      this.inverse.copy(at(this.source.restWorld, from)).invert();
      this.q.multiply(this.inverse);
      reflectKeyboard88Quaternion(this.q, at(this.desired, i));
      at(this.desired, i).multiply(at(this.source.restWorld, i));
    }
    for (let i = 0; i < this.rig.parents.length; i++) {
      const parent = at(this.rig.parents, i);
      this.inverse.copy(parent < 0 ? this.rootRotation : at(this.desired, parent)).invert();
      this.q
        .copy(this.inverse)
        .multiply(at(this.desired, i))
        .normalize()
        .toArray(this.mirrored, i * 4);
    }
    return this.mirrored;
  }

  /** Returns reachability of the +18 mm wrist target; near singularities clamp without stretching. */
  compose(
    right: ArrayLike<number>,
    leftSource: ArrayLike<number>,
    output: Float32Array,
    options?: { readonly torso?: boolean; readonly correction?: boolean }
  ): boolean {
    const left = this.mirror(leftSource);
    this.source.set(right);
    this.captureTarget(this.source, 0, 0);
    this.skeleton.set(left);
    this.captureTarget(this.skeleton, 1, options?.correction === false ? 0 : KEYBOARD88_ARM_SHIFT);
    for (let i = 0; i < output.length; i++) output[i] = at(right, i);
    for (let i = 0; i < this.left.length; i++) {
      const index = at(this.left, i);
      for (let j = 0; j < 4; j++) output[index * 4 + j] = at(left, index * 4 + j);
    }
    for (let i = 0; i < this.shared.length; i++) {
      const index = at(this.shared, i);
      if (options?.torso === false) {
        for (let j = 0; j < 4; j++) output[index * 4 + j] = at(left, index * 4 + j);
      } else {
        this.q.fromArray(right, index * 4);
        this.other.fromArray(left, index * 4);
        this.q
          .slerp(this.other, 0.5)
          .normalize()
          .toArray(output, index * 4);
      }
    }
    this.skeleton.set(output);
    this.unreachableMask = 0;
    for (let side = options?.torso === false ? 1 : 0; side < 2; side++) {
      if (options?.torso === false && options.correction === false) continue;
      if (!this.solveArm(side)) this.unreachableMask |= 1 << side;
    }
    this.skeleton.write(output);
    return this.unreachableMask === 0;
  }

  private readRotation(
    target: { x: number; y: number; z: number; w: number },
    matrix: Matrix4
  ): void {
    this.q.setFromRotationMatrix(matrix);
    target.x = this.q.x;
    target.y = this.q.y;
    target.z = this.q.z;
    target.w = this.q.w;
  }

  private readPose(bones: Keyboard88Bones, side: number): void {
    const arm = at(this.arms, side),
      shoulder = at(arm, 0),
      elbow = at(arm, 1),
      wrist = at(arm, 2);
    Object.assign(this.pose.shoulder, bones.head(shoulder, this.point));
    Object.assign(this.pose.elbow, bones.head(elbow, this.point));
    Object.assign(this.pose.wrist, bones.head(wrist, this.point));
    const upper = at(bones.bones, shoulder),
      lower = at(bones.bones, elbow);
    if (!upper.parent) throw new Error("Unparented keyboard88 shoulder");
    this.readRotation(this.pose.parentRotation, upper.parent.matrixWorld);
    this.readRotation(this.pose.shoulderRotation, upper.matrixWorld);
    this.readRotation(this.pose.elbowRotation, lower.matrixWorld);
  }

  private captureTarget(bones: Keyboard88Bones, side: number, shift: number): void {
    this.readPose(bones, side);
    const target = at(this.targets, side),
      wrist = at(at(this.arms, side), 2);
    target.position.x = this.pose.wrist.x + shift;
    target.position.y = this.pose.wrist.y;
    target.position.z = this.pose.wrist.z;
    target.pole.x = this.pose.elbow.x - this.pose.shoulder.x;
    target.pole.y = this.pose.elbow.y - this.pose.shoulder.y;
    target.pole.z = this.pose.elbow.z - this.pose.shoulder.z;
    this.readRotation(target.rotation, at(bones.bones, wrist).matrixWorld);
  }

  private solveArm(side: number): boolean {
    this.readPose(this.skeleton, side);
    const reachable = this.ik.solve(this.pose, at(this.targets, side));
    const arm = at(this.arms, side);
    const upper = this.ik.shoulder,
      lower = this.ik.elbow,
      wrist = this.ik.wrist;
    at(this.skeleton.bones, at(arm, 0)).quaternion.set(upper.x, upper.y, upper.z, upper.w);
    at(this.skeleton.bones, at(arm, 1)).quaternion.set(lower.x, lower.y, lower.z, lower.w);
    at(this.skeleton.bones, at(arm, 2)).quaternion.set(wrist.x, wrist.y, wrist.z, wrist.w);
    this.skeleton.update();
    return reachable;
  }
}
