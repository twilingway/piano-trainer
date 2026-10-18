import { Bone, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { HandsSource } from "./liveHands";
import { performerMotion } from "./performerMotion";
import type { PianistFace } from "./PianistFace";
import type { PerformerMotion } from "./performerMotion";
import type { Hand } from "../../fingering/fingering";
import { BoneFrame, solverPoint } from "./handPose";
import { CHAIN, at, clamp, fingerPlane, handJoints, rootRotation } from "./handSolver/mech";
import type { Rest, Vec3 } from "./handSolver/mech";
import type { HandAt } from "./handSolver/track";
import { fit } from "./handSolver/fit";
import { solvePianistArm } from "./pianistArmIk";
import { HandSkin } from "./handSkin";
import type { Finger } from "../../fingering/fingering";
import { pianistHandProfile } from "./pianistRigProfile";
import type { PianistHandProfile } from "./pianistRigProfile";
import type { SkinRadii } from "./handScenePose";
import type { SkinGeometry } from "./skinGeometry";

const HANDS: readonly Hand[] = ["left", "right"];
type Poses = Readonly<Record<Hand, HandAt | undefined>>;
const turnFor = (pitch: number, side: number) =>
  new Quaternion().setFromEuler(new Euler(pitch, 0, side));

/** Drives the original weighted skeleton. No reparenting, translation, scaling or second clock. */
export class PianistRig {
  readonly rest: Readonly<Record<Hand, Rest>>;
  readonly radii: Readonly<Record<Hand, SkinRadii>>;
  readonly joints: Record<Hand, readonly Vec3[] | undefined> = {
    left: undefined,
    right: undefined
  };
  readonly reachError: Record<Hand, number> = { left: 0, right: 0 };
  private readonly frame: BoneFrame;
  readonly geometry: Record<Hand, SkinGeometry | undefined> = { left: undefined, right: undefined };
  readonly skins: Readonly<Record<Hand, HandSkin>>;
  private readonly toSolver = new Matrix4();
  private readonly seated = new Map<Bone, Quaternion>();
  private readonly shoulders = new Map<Hand, Vector3>();
  private readonly wrists = new Map<Hand, Vector3>();
  private readonly parked = new Map<Hand, HandAt>();
  private readonly head: Bone | undefined;
  private readonly leftFoot: Bone | undefined;
  private pivot = new Vector3();
  private spineTurn = new Quaternion();
  private face: PianistFace | undefined;
  private nativeHandsVisible = true;

  setNativeHandsVisible(visible: boolean): void {
    this.nativeHandsVisible = visible;
    for (const hand of HANDS) for (const mesh of this.profiles[hand].meshes) mesh.visible = visible;
  }
  private faceNotesSource: HandsSource["notes"] | undefined;
  private faceNotes: HandsSource["notes"]["left"] = [];

  setFace(face: PianistFace | undefined): void {
    this.face = face;
  }

  static create(scene: Object3D): PianistRig | undefined {
    scene.updateMatrixWorld(true);
    const spine = scene.getObjectByName("spine");
    if (!(spine instanceof Bone)) return undefined;
    try {
      return new PianistRig(scene, spine as Bone, {
        left: pianistHandProfile(scene, "left"),
        right: pianistHandProfile(scene, "right")
      });
    } catch {
      return undefined;
    }
  }

  private constructor(
    private readonly scene: Object3D,
    private readonly spine: Bone,
    private readonly profiles: Readonly<Record<Hand, PianistHandProfile>>
  ) {
    this.frame = new BoneFrame(scene);
    const head = scene.getObjectByName("head"),
      foot = scene.getObjectByName("footL");
    this.head = head instanceof Bone ? head : undefined;
    this.leftFoot = foot instanceof Bone ? foot : undefined;
    this.rest = { left: profiles.left.rest, right: profiles.right.rest };
    this.radii = { left: profiles.left.radii, right: profiles.right.radii };
    const skin = (hand: Hand) =>
      new HandSkin(
        profiles[hand].glove,
        new Map(profiles[hand].phalanges.map((p) => [p.bone, p.finger]))
      );
    this.skins = { left: skin("left"), right: skin("right") };
  }

  /** Capture once after the seated clip's first frame; subsequent seeks start from this pose. */
  seat(): void {
    this.scene.updateMatrixWorld(true);
    this.seated.clear();
    this.scene.traverse((node) => {
      if (node instanceof Bone) this.seated.set(node as Bone, node.quaternion.clone());
    });
    this.pivot = this.frame.head(this.spine);
    this.spineTurn = this.frame.turn(this.spine);
    for (const hand of HANDS) {
      this.shoulders.set(hand, this.frame.head(this.profiles[hand].upper));
      const wrist = this.frame.head(this.profiles[hand].wrist);
      this.wrists.set(hand, wrist);
      this.parked.set(hand, {
        root: [0, 10, -10, wrist.x * 1000 * (hand === "left" ? -1 : 1), -180, 160],
        angles: {
          1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
          2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
          3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
          4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
          5: { mcp: 20, pip: 30, dip: 20, abd: 0 }
        }
      });
    }
    const calibration: HandAt = {
      root: [0, 10, -10, 100, -80, 70],
      angles: {
        1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
        2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        5: { mcp: 20, pip: 30, dip: 20, abd: 0 }
      }
    };
    this.pose({ left: calibration, right: calibration });
    for (const hand of HANDS) {
      const toSolver = this.scene.matrixWorld.clone().invert();
      if (hand === "left") toSolver.premultiply(new Matrix4().makeScale(-1, 1, 1));
      this.geometry[hand] = this.skins[hand].bake(this.rest[hand], calibration, toSolver);
    }
    this.pose({ left: undefined, right: undefined });
  }

  pose(poses: Poses, source?: HandsSource): void {
    if (!this.seated.size) this.seat();
    for (const [bone, turn] of this.seated) bone.quaternion.copy(turn);
    this.scene.updateMatrixWorld(true);
    const targets = new Map<Hand, Vector3>();
    for (const hand of HANDS) {
      const pose = poses[hand];
      this.joints[hand] = pose ? handJoints(this.rest[hand], pose.angles, pose.root) : undefined;
      this.reachError[hand] = 0;
      for (const mesh of this.profiles[hand].meshes) mesh.visible = this.nativeHandsVisible;
      if (pose) targets.set(hand, this.point(at(this.joints[hand] ?? [], 0), hand));
    }
    const motion = performerMotion(source?.time ?? 0, source?.beats ?? []);
    this.followBody(targets, motion.bodyRoll);
    for (const hand of HANDS) {
      const pose = poses[hand];
      const joints = this.joints[hand];
      if (pose && joints) {
        this.poseHand(this.profiles[hand], pose, joints);
        this.skins[hand].update(pose);
      } else {
        // A pending/empty hand remains attached and clear of the keys without claiming contact.
        const parked = this.parked.get(hand);
        if (parked)
          this.poseHand(
            this.profiles[hand],
            parked,
            handJoints(this.rest[hand], parked.angles, parked.root)
          );
      }
    }
    // Cache the score list; blinking and gaze still sample the shared, seekable song time.
    if (source && source.notes !== this.faceNotesSource) {
      this.faceNotesSource = source.notes;
      this.faceNotes = [...source.notes.left, ...source.notes.right];
    }
    const expression = this.face?.update(source?.time ?? 0, this.faceNotes);
    this.applyMusicalMotion(motion, expression?.gazeYaw ?? 0, expression?.gazePitch ?? 0);
    this.scene.updateMatrixWorld(true);
  }

  private applyMusicalMotion(motion: PerformerMotion, gazeYaw = 0, gazePitch = 0): void {
    if (this.head) {
      const turn = new Quaternion().setFromEuler(
        new Euler(gazePitch, motion.headYaw - gazeYaw, motion.headRoll)
      );
      this.frame.setTurn(this.head, turn.multiply(this.frame.turn(this.head)));
    }
    if (this.leftFoot) {
      const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), motion.leftFootPitch);
      this.frame.setTurn(this.leftFoot, turn.multiply(this.frame.turn(this.leftFoot)));
    }
  }

  contact(
    hand: Hand,
    finger: Finger,
    pitch: number
  ): { height: number; along: number } | undefined {
    if (!this.joints[hand] || this.reachError[hand] > 0.0001) return undefined;
    this.toSolver.copy(this.scene.matrixWorld).invert();
    if (hand === "left") this.toSolver.premultiply(new Matrix4().makeScale(-1, 1, 1));
    return this.skins[hand].contact(finger, pitch, hand === "left", this.toSolver);
  }

  private point(p: Vec3, hand: Hand): Vector3 {
    return solverPoint([p[0] * (hand === "left" ? -1 : 1), p[1], p[2]]).multiplyScalar(0.001);
  }

  /** A continuous bounded fit follows both wrists about the fixed pelvis, independent of history. */
  private followBody(targets: ReadonlyMap<Hand, Vector3>, roll: number): void {
    if (!targets.size) {
      this.frame.setTurn(this.spine, turnFor(0, roll).multiply(this.spineTurn));
      return;
    }
    const delta = new Vector3();
    for (const [hand, target] of targets)
      delta.add(target.clone().sub(this.wrists.get(hand) ?? target));
    delta.divideScalar(targets.size);
    const preferred = [clamp(delta.z * 0.8, -0.35, 0.25), clamp(-delta.x * 0.8, -0.45, 0.45)];
    const radians = Math.PI / 180;
    const residual = (degrees: readonly number[]): number[] => {
      const pitch = at(degrees, 0) * radians;
      const side = at(degrees, 1) * radians + roll;
      const turn = turnFor(pitch, side);
      const values = [
        Math.sqrt(0.002) * (pitch - at(preferred, 0)),
        Math.sqrt(0.002) * (side - at(preferred, 1))
      ];
      for (const [hand, target] of targets) {
        const profile = this.profiles[hand];
        const shoulder = (this.shoulders.get(hand) ?? this.pivot)
          .clone()
          .sub(this.pivot)
          .applyQuaternion(turn)
          .add(this.pivot);
        values.push(
          Math.max(
            0,
            shoulder.distanceTo(target) - 0.98 * (profile.upperLength + profile.lowerLength)
          )
        );
      }
      return values;
    };
    const solution = fit(
      preferred.map((v) => v / radians),
      [-0.65 / radians, -0.7 / radians],
      [0.35 / radians, 0.7 / radians],
      residual,
      [true, true],
      32
    );
    this.frame.setTurn(
      this.spine,
      turnFor(at(solution.x, 0) * radians, at(solution.x, 1) * radians + roll).multiply(
        this.spineTurn
      )
    );
  }

  private poseHand(profile: PianistHandProfile, pose: HandAt, joints: readonly Vec3[]): void {
    const hand = profile.hand;
    const mirror = hand === "left" ? -1 : 1;
    const R = rootRotation(pose.root);
    const column = (i: 0 | 1 | 2) => solverPoint([mirror * R[0][i], R[1][i], R[2][i]]);
    const basis = new Matrix4().makeBasis(column(0), column(1), column(2));
    const rotation = new Quaternion().setFromRotationMatrix(
      basis.multiply(profile.fromHandFrame.clone().invert())
    );
    const wristTurn = rotation.multiply(profile.wristBindTurn);
    const target = this.point(at(joints, 0), hand);
    const shoulder = this.frame.head(profile.upper);
    const pole = shoulder.clone().add(new Vector3(mirror * 0.22, -0.25, 0.3));
    const solution = solvePianistArm(
      shoulder,
      target,
      profile.upperLength,
      profile.lowerLength,
      pole
    );
    this.reachError[hand] = solution.error;
    this.frame.aim(profile.upper, solution.elbow);
    this.frame.aim(profile.forearm, solution.wrist);
    this.frame.setTurn(profile.wrist, wristTurn);
    for (const phalanx of profile.phalanges) {
      const chain = CHAIN[phalanx.finger];
      const plane = fingerPlane(this.rest[hand], pose.angles, pose.root, phalanx.finger);
      const normal = solverPoint([mirror * plane[0], plane[1], plane[2]]).multiplyScalar(
        mirror * (phalanx.finger === 1 ? 1 : -1)
      );
      this.frame.aim(phalanx.bone, this.point(at(joints, at(chain, phalanx.joint + 1)), hand));
      if (normal.lengthSq() > 1e-16)
        this.frame.alignAxis(phalanx.bone, phalanx.bendAxis, normal.normalize());
    }
  }
}
