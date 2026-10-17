import { Quaternion, Vector3 } from "three";
import type { Bone } from "three";
import type { Finger } from "../../fingering/fingering";
import { BONE_AXIS } from "./handPose";
import type { BoneFrame } from "./handPose";

const NAIL = new Vector3(0.717, 0, -0.697).normalize();
const TILT = Math.PI / 3;

/** Keep the studio thumb nail outside while preserving the other fingers' rest roll. */
export class StudioThumbRoll {
  private readonly nails = new Map<Bone, Vector3>();

  constructor(
    private readonly frame: BoneFrame,
    phalanges: readonly { readonly bone: Bone; readonly finger: Finger; readonly joint: number }[]
  ) {
    const tip = phalanges.find((p) => p.finger === 1 && p.joint === 2);
    if (!tip) throw new Error("hand.glb has no thumb");
    const nail = NAIL.clone().applyQuaternion(frame.turn(tip.bone));
    for (const p of phalanges)
      if (p.finger === 1)
        this.nails.set(p.bone, nail.clone().applyQuaternion(frame.turn(p.bone).invert()));
  }

  pose(bone: Bone, up: Vector3, away: Vector3): void {
    const nail = this.nails.get(bone);
    if (!nail) return;
    const turn = this.frame.turn(bone);
    const along = BONE_AXIS.clone().applyQuaternion(turn);
    const back = up.clone().addScaledVector(along, -up.dot(along));
    const have = nail.clone().applyQuaternion(turn);
    have.addScaledVector(along, -have.dot(along));
    if (back.lengthSq() < 1e-12 || have.lengthSq() < 1e-12) return;
    back.normalize();
    const side = along.clone().cross(back);
    if (side.dot(away) < 0) side.negate();
    const want = back.multiplyScalar(Math.cos(TILT)).addScaledVector(side, Math.sin(TILT));
    const angle = Math.atan2(have.clone().cross(want).dot(along), have.dot(want));
    this.frame.setTurn(bone, new Quaternion().setFromAxisAngle(along, angle).multiply(turn));
  }
}
