import { Bone, Euler, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { SongBeat } from "../../song/song";
import { BoneFrame } from "./handPose";
import { performerMotion } from "./performerMotion";

interface Rotation {
  readonly bone: Bone;
  readonly base: Quaternion;
  readonly applied: Quaternion;
  owned: boolean;
}
const find = (scene: Object3D, names: readonly string[]): Rotation | undefined => {
  for (const name of names) {
    const bone = scene.getObjectByName(name);
    if (bone instanceof Bone)
      return {
        bone: bone as Bone,
        base: bone.quaternion.clone(),
        applied: bone.quaternion.clone(),
        owned: false
      };
  }
  return undefined;
};

/** Small musical accents on the original head and left foot; baked body/hand contacts stay intact. */
export class NativePerformerMotion {
  private readonly head: Rotation | undefined;
  private readonly foot: Rotation | undefined;
  private readonly frame: BoneFrame;
  private readonly turn = new Quaternion();
  private readonly angles = new Euler();
  private readonly right = new Vector3(1, 0, 0);
  private disposed = false;

  constructor(private readonly scene: Object3D) {
    this.head = find(scene, ["head", "Head"]);
    this.foot = find(scene, ["foot.L", "footL"]);
    this.frame = new BoneFrame(scene);
  }

  /** Call after gaze.prepare(), before the next native mixer sample, even for untracked bones. */
  prepare(): void {
    for (const track of [this.head, this.foot]) {
      if (!track?.owned) continue;
      if (track.bone.quaternion.equals(track.applied)) track.bone.quaternion.copy(track.base);
      track.owned = false;
    }
    this.scene.updateWorldMatrix(true, true);
  }

  apply(time: number, beats: readonly SongBeat[]): void {
    if (this.disposed) return;
    this.prepare();
    const motion = performerMotion(time, beats);
    if (motion.headYaw !== 0 || motion.headRoll !== 0) {
      this.turn.setFromEuler(this.angles.set(0, motion.headYaw, motion.headRoll));
      this.applyTurn(this.head, this.turn);
    }
    // Common glTF Y-up frame: +X turns a toe pointing towards keyboard -Z upwards.
    if (motion.leftFootPitch !== 0) {
      this.turn.setFromAxisAngle(this.right, motion.leftFootPitch);
      this.applyTurn(this.foot, this.turn);
    }
  }

  private applyTurn(track: Rotation | undefined, delta: Quaternion): void {
    if (!track) return;
    track.base.copy(track.bone.quaternion);
    this.frame.setTurn(track.bone, delta.multiply(this.frame.turn(track.bone)));
    track.applied.copy(track.bone.quaternion);
    track.owned = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.prepare();
    this.disposed = true;
  }
}
