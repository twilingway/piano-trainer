import { Matrix4, Quaternion, Vector3 } from "three";
import { Keyboard88Bones, keyboard88At as at } from "./keyboard88Bones.ts";
import type { Keyboard88Rig } from "./keyboard88Bones";

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
  private readonly delta = new Quaternion();
  private readonly inverse = new Quaternion();
  private readonly shoulder: number;
  private readonly elbow: number;
  private readonly wrist: number;
  private readonly start = new Vector3();
  private readonly middle = new Vector3();
  private readonly end = new Vector3();
  private readonly target = new Vector3();
  private readonly direction = new Vector3();
  private readonly plane = new Vector3();
  private readonly wantedElbow = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly wristRotation = new Quaternion();

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
    this.shoulder = rig.boneNames.indexOf("m_avg_L_Shoulder");
    this.elbow = rig.boneNames.indexOf("m_avg_L_Elbow");
    this.wrist = rig.boneNames.indexOf("m_avg_L_Wrist");
    if ([...this.shared, this.shoulder, this.elbow, this.wrist].some((i) => i < 0))
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
    for (const [i, from] of this.map.entries()) {
      this.q.setFromRotationMatrix(at(this.source.bones, from).matrixWorld);
      this.inverse.copy(at(this.source.restWorld, from)).invert();
      this.q.multiply(this.inverse);
      reflectKeyboard88Quaternion(this.q, at(this.desired, i));
      at(this.desired, i).multiply(at(this.source.restWorld, i));
    }
    for (const [i, parent] of this.rig.parents.entries()) {
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
    options: { readonly torso?: boolean; readonly correction?: boolean } = {}
  ): boolean {
    const left = this.mirror(leftSource);
    for (let i = 0; i < output.length; i++) output[i] = at(right, i);
    for (const index of this.left)
      for (let j = 0; j < 4; j++) output[index * 4 + j] = at(left, index * 4 + j);
    for (const index of this.shared) {
      if (options.torso === false) {
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
    const reachable = options.correction === false || this.correctArm();
    this.skeleton.write(output);
    return reachable;
  }

  private aim(index: number, from: Vector3, to: Vector3): void {
    const bone = at(this.skeleton.bones, index);
    if (!bone.parent) throw new Error("Unparented keyboard88 arm bone");
    this.delta.setFromUnitVectors(from.normalize(), to.normalize());
    this.q.setFromRotationMatrix(bone.matrixWorld).premultiply(this.delta);
    this.inverse.setFromRotationMatrix(bone.parent.matrixWorld).invert();
    bone.quaternion.copy(this.inverse).multiply(this.q).normalize();
    this.skeleton.update();
  }

  private correctArm(): boolean {
    const bones = this.skeleton;
    bones.head(this.shoulder, this.start);
    bones.head(this.elbow, this.middle);
    bones.head(this.wrist, this.end);
    const wrist = at(bones.bones, this.wrist);
    this.wristRotation.setFromRotationMatrix(wrist.matrixWorld);
    this.target.copy(this.end);
    this.target.x += KEYBOARD88_ARM_SHIFT;
    const a = this.start.distanceTo(this.middle),
      b = this.middle.distanceTo(this.end);
    this.direction.subVectors(this.target, this.start);
    const requested = this.direction.length();
    const distance = Math.max(Math.abs(a - b) + 1e-8, Math.min(a + b - 1e-8, requested));
    this.direction.normalize();
    this.plane.subVectors(this.middle, this.start);
    this.plane.addScaledVector(this.direction, -this.plane.dot(this.direction));
    if (this.plane.lengthSq() < 1e-12) {
      this.plane.set(0, 1, 0).cross(this.direction);
      if (this.plane.lengthSq() < 1e-12) this.plane.set(0, 0, 1).cross(this.direction);
    }
    this.plane.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    this.wantedElbow
      .copy(this.start)
      .addScaledVector(this.direction, along)
      .addScaledVector(this.plane, Math.sqrt(Math.max(0, a * a - along * along)));
    this.from.subVectors(this.middle, this.start);
    this.to.subVectors(this.wantedElbow, this.start);
    this.aim(this.shoulder, this.from, this.to);
    bones.head(this.elbow, this.middle);
    bones.head(this.wrist, this.end);
    this.from.subVectors(this.end, this.middle);
    this.to.copy(this.start).addScaledVector(this.direction, distance).sub(this.middle);
    this.aim(this.elbow, this.from, this.to);
    if (!wrist.parent) throw new Error("Unparented keyboard88 wrist");
    this.inverse.setFromRotationMatrix(wrist.parent.matrixWorld).invert();
    wrist.quaternion.copy(this.inverse).multiply(this.wristRotation).normalize();
    bones.update();
    return Math.abs(requested - distance) < 1e-7;
  }
}
