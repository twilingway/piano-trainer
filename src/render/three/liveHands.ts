import {
  Bone,
  Group,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  PropertyBinding,
  Quaternion,
  Vector3
} from "three";
import type { BufferGeometry, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Finger, Hand } from "../../fingering/fingering";
import type { HandNotes, PlanChunk } from "./handSolver/chunks";
import {
  CHAIN,
  FINGERS,
  KEY_DIP,
  WHITE_W,
  at,
  handJoints,
  keyTarget,
  rootRotation,
  tipOf,
  whitePosition
} from "./handSolver/mech";
import type { Vec3 } from "./handSolver/mech";
import type { FingeredNote, PlanKey } from "./handSolver/plan";
import { READY } from "./handSolver/plan";
import { STUDIO_FRAME, STUDIO_REST } from "./handSolver/rest";
import { knownUntil, sampleTrack } from "./handSolver/track";
import type { HandAt, Track, TrackPose } from "./handSolver/track";

/** What the hands play: the song's notes of each hand and the song time now. */
export interface HandsSource {
  readonly time: number;
  readonly notes: Readonly<Record<Hand, readonly FingeredNote[]>>;
}

/** Plans the hands' notes somewhere and hands the plan on in parts; returns a cancel. */
export type Planner = (notes: HandNotes, onChunk: (chunk: PlanChunk) => void) => () => void;

/** The plan in a worker, off the frame loop. */
export const workerPlanner: Planner = (notes, onChunk) => {
  const worker = new Worker(new URL("./handPlan.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<PlanChunk>) => {
    onChunk(event.data);
  };
  worker.onerror = (error) => {
    console.warn("3D hands: the plan failed", error);
  };
  worker.postMessage(notes);
  return () => {
    worker.terminate();
  };
};

/** A white key across, metres: the solver's keyboard. */
const WHITE_M = WHITE_W / 1000;
/** How far the forearm keeps to the hand's line across the keys; the rest runs straight from the player. */
const FOREARM_WITH_HAND = 0.5;
/** The forearm rises this much a metre from the elbow to the wrist. */
const FOREARM_RISE = 0.1;
const Y_AXIS = new Vector3(0, 1, 0);
/** Into the keys, glTF axes: the player sits towards +Z. */
const INTO_KEYS = new Vector3(0, 0, -1);
/** Blender (Z up, keys towards +Y) to glTF (Y up): (x, y, z) → (x, z, -y). */
// prettier-ignore
const TO_GLTF = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1
);
const gltf = (v: Vec3) => new Vector3(v[0], v[2], -v[1]);

export async function loadHand(): Promise<Object3D> {
  const model = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/hand.glb`);
  model.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    // Its bounds stay those of the rest pose: never cull the posed hand.
    node.frustumCulled = false;
    // Like the keys, the skin's colours are display values here.
    const material = node.material as MeshStandardMaterial;
    if (material.map) material.map.colorSpace = LinearSRGBColorSpace;
    // The nails' vertex colours come linear: as display values they would turn dark red.
    const geometry = node.geometry as BufferGeometry;
    if (!geometry.hasAttribute("color")) return;
    const colour = geometry.getAttribute("color");
    for (let i = 0; i < colour.count; i++)
      colour.setXYZ(i, toSrgb(colour.getX(i)), toSrgb(colour.getY(i)), toSrgb(colour.getZ(i)));
  });
  return model.scene;
}

const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A bone's name as GLTFLoader leaves it: without the dots. */
const nodeName = (name: string) => PropertyBinding.sanitizeNodeName(name);

interface Phalanx {
  readonly bone: Bone;
  readonly rest: Quaternion;
  readonly finger: Finger;
  /** 0 at the knuckle, 2 at the tip. */
  readonly joint: number;
}

/**
 * The hand frame's map from the rig's armature (Blender axes, units) to the solver's world (mm):
 * p ↦ R·F·S·(p − w) + t, as hand_mech.rest_from_rig and hand_joints have it.
 */
function armToWorld(root: HandAt["root"]): { m: readonly Vec3[]; t: Vec3 } {
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

/** One hand of the studio rig, its bones set on the solver's joints every frame. */
export class LiveRig {
  /** Places the solver's world on the keys: metres in glTF axes, C4's centre, the white front and top
   * at the origin; mirrored for the left hand. */
  readonly space = new Group();
  private readonly rig: Object3D;
  private readonly phalanges: Phalanx[] = [];
  private readonly arm: Bone;
  private readonly wrist: Bone;
  /** The wrist on the forearm at rest: its turn and how far from the forearm's head. */
  private readonly wristRest: Quaternion;
  private readonly wristOnArm: number;
  /** The nail's axis in a phalanx's own frame (the bones share their convention). */
  private readonly nail: Vector3;
  /** The solver's joints now, mm in the hand's (for the left hand mirrored) world. */
  joints: Vec3[] | undefined;

  constructor(
    model: Object3D,
    private readonly hand: Hand
  ) {
    const scene = clone(model);
    const rig = scene.getObjectByName("HandRig");
    if (!rig) throw new Error("hand.glb has no HandRig");
    this.rig = rig;
    const arm = scene.getObjectByName(nodeName("lowerarm02.R"));
    const wrist = scene.getObjectByName(nodeName("wrist.R"));
    if (!(arm instanceof Bone) || !(wrist instanceof Bone)) throw new Error("hand.glb has no arm");
    this.arm = arm as Bone;
    this.wrist = wrist as Bone;
    this.wristRest = wrist.quaternion.clone();
    this.wristOnArm = wrist.position.length();
    // Bones at rest in the armature's frame: the rig itself is placed every frame.
    rig.matrixAutoUpdate = false;
    rig.matrix.identity();
    scene.updateMatrixWorld(true);
    // The wrist carries the hand; the forearm follows it rather than holding it.
    rig.attach(wrist);
    for (const f of FINGERS)
      for (let j = 0; j < 3; j++) {
        const bone = scene.getObjectByName(nodeName(`finger${String(f)}-${String(j + 1)}.R`));
        if (!(bone instanceof Bone)) throw new Error(`hand.glb has no finger ${String(f)}`);
        this.phalanges.push({
          bone: bone as Bone,
          rest: bone.quaternion.clone(),
          finger: f,
          joint: j
        });
      }
    // The nail: the axis of finger2-2 along the back of the hand at rest.
    const index = this.phalanges.find((p) => p.finger === 2 && p.joint === 1);
    if (!index) throw new Error("hand.glb has no index finger");
    const up = gltf(STUDIO_FRAME.F[2]);
    const restTurn = this.armTurn(index.bone);
    const axes = [new Vector3(1, 0, 0), new Vector3(0, 0, 1)];
    const along = axes.map((a) => a.clone().applyQuaternion(restTurn).dot(up));
    const k = Math.abs(at(along, 0)) >= Math.abs(at(along, 1)) ? 0 : 1;
    this.nail = at(axes, k).multiplyScalar(Math.sign(at(along, k)) || 1);
    this.space.add(scene);
    this.space.visible = false;
  }

  /** `c4` is C4's centre in the keys' group, `white` a white key across in its units. */
  layout(c4: number, white: number): void {
    const k = white / WHITE_M;
    const mirror = this.hand === "left" ? -1 : 1;
    this.space.scale.set(mirror * k, k, k);
    // The white keys' top sits at 22 in the keys' group, their front edge at 0.
    this.space.position.set(c4, 22, 0);
  }

  /** Poses the rig at the solver's hand, or hides it. */
  pose(hand: HandAt | undefined): void {
    this.space.visible = hand !== undefined;
    if (!hand) {
      this.joints = undefined;
      return;
    }
    const X = handJoints(STUDIO_REST, hand.angles, hand.root);
    this.joints = X;
    const { m, t } = armToWorld(hand.root);
    const [r0, r1, r2] = [at(m, 0), at(m, 1), at(m, 2)];
    // prettier-ignore
    const place = new Matrix4().set(
      r0[0], r0[1], r0[2], t[0],
      r1[0], r1[1], r1[2], t[1],
      r2[0], r2[1], r2[2], t[2],
      0, 0, 0, 1
    );
    // Armature (glTF axes) → solver world (Blender axes, mm) → metres in glTF axes.
    this.rig.matrix
      .copy(TO_GLTF)
      .multiply(new Matrix4().makeScale(0.001, 0.001, 0.001))
      .multiply(place)
      .multiply(TO_GLTF.clone().invert());
    this.rig.matrixWorldNeedsUpdate = true;
    this.rig.updateMatrixWorld(true);
    const toArm = new Matrix4().copy(this.rig.matrix).invert();
    const inArm = (p: Vec3) => gltf([p[0] / 1000, p[1] / 1000, p[2] / 1000]).applyMatrix4(toArm);
    const up = gltf(STUDIO_FRAME.F[2]).normalize();
    const away = inArm(at(X, 1)).sub(inArm(at(X, 5)));
    for (const p of this.phalanges) {
      p.bone.quaternion.copy(p.rest);
      p.bone.updateMatrixWorld(true);
    }
    for (const p of this.phalanges) {
      this.aim(p.bone, inArm(at(X, at(CHAIN[p.finger], p.joint + 1))));
      if (p.finger === 1) this.turnNail(p.bone, up, away);
    }
    this.aimForearm();
  }

  /** A bone's turn in the armature's frame. */
  private armTurn(bone: Object3D): Quaternion {
    const rel = new Matrix4().copy(this.rig.matrixWorld).invert().multiply(bone.matrixWorld);
    const turn = new Quaternion();
    rel.decompose(new Vector3(), turn, new Vector3());
    return turn;
  }

  private armHead(bone: Object3D): Vector3 {
    return new Vector3().setFromMatrixPosition(
      new Matrix4().copy(this.rig.matrixWorld).invert().multiply(bone.matrixWorld)
    );
  }

  /** Sets a bone's local turn so its armature turn becomes `turn`. */
  private setArmTurn(bone: Bone, turn: Quaternion): void {
    const parent = this.armTurn(bone).multiply(bone.quaternion.clone().invert());
    bone.quaternion.copy(parent.invert().multiply(turn));
    bone.updateMatrixWorld(true);
  }

  /** Turns a bone about its head, the shortest way, so its tail points at `target` (armature frame). */
  private aim(bone: Bone, target: Vector3): void {
    const turn = this.armTurn(bone);
    const along = Y_AXIS.clone().applyQuaternion(turn);
    const want = target.clone().sub(this.armHead(bone)).normalize();
    this.setArmTurn(bone, new Quaternion().setFromUnitVectors(along, want).multiply(turn));
  }

  /** The thumb lies on its side: its nail in the palm's plane, away from the index finger. */
  private turnNail(bone: Bone, up: Vector3, away: Vector3): void {
    const turn = this.armTurn(bone);
    const b = Y_AXIS.clone().applyQuaternion(turn);
    let want = b.clone().cross(up);
    if (want.dot(away) < 0) want.negate();
    const have = this.nail.clone().applyQuaternion(turn);
    want = want.sub(b.clone().multiplyScalar(want.dot(b)));
    have.sub(b.clone().multiplyScalar(have.dot(b)));
    if (want.lengthSq() < 1e-12 || have.lengthSq() < 1e-12) return;
    const angle = have.angleTo(want) * (have.clone().cross(want).dot(b) > 0 ? 1 : -1);
    this.setArmTurn(bone, new Quaternion().setFromAxisAngle(b, angle).multiply(turn));
  }

  /**
   * Lays the forearm behind the wrist, nearly straight from the player: half along the hand's own
   * line across the keys, rising a little to the wrist. It moves with the hand and carries the
   * hand's twist, so the skin at the wrist neither folds nor wrings.
   */
  private aimForearm(): void {
    const turn = new Quaternion();
    this.rig.matrix.decompose(new Vector3(), turn, new Vector3());
    const hand = Y_AXIS.clone().applyQuaternion(this.wrist.quaternion).applyQuaternion(turn);
    hand.y = 0;
    const along = hand
      .normalize()
      .lerp(INTO_KEYS, 1 - FOREARM_WITH_HAND)
      .normalize()
      .setY(FOREARM_RISE)
      .normalize()
      .applyQuaternion(turn.invert());
    // The forearm as the wrist sits on it at rest, then swung the shortest way onto `along`.
    const rest = this.wrist.quaternion.clone().multiply(this.wristRest.clone().invert());
    const axis = Y_AXIS.clone().applyQuaternion(rest);
    this.arm.quaternion.copy(rest).premultiply(new Quaternion().setFromUnitVectors(axis, along));
    this.arm.position.copy(this.wrist.position).addScaledVector(along, -this.wristOnArm);
    this.arm.updateMatrixWorld(true);
  }
}

/** A hand's plan as it arrives from the planner. */
interface Lane {
  keys: PlanKey[];
  poses: TrackPose[];
  done: boolean;
}

const emptyLane = (): Lane => ({ keys: [], poses: [], done: false });

/** Both hands over the 3D keys, posed by the example solver's plan. */
export class LiveHands {
  readonly group = new Group();
  private readonly rigs: readonly LiveRig[];
  private lanes: Record<Hand, Lane> = { left: emptyLane(), right: emptyLane() };
  private notes: HandsSource["notes"] | undefined;
  private cancel: (() => void) | undefined;

  constructor(
    model: Object3D,
    private readonly planner: Planner = workerPlanner
  ) {
    this.rigs = [new LiveRig(model, "left"), new LiveRig(model, "right")];
    for (const rig of this.rigs) this.group.add(rig.space);
  }

  /** `white` is any white key: its pitch, centre and width in the keys' group. */
  layout(white: { readonly pitch: number; readonly x: number; readonly width: number }): void {
    const c4 = white.x - whitePosition(white.pitch) * white.width;
    for (const rig of this.rigs) rig.layout(c4, white.width);
  }

  /** How far each key the hands play is down now, 0..1. */
  readonly keys = new Map<number, number>();

  update(source: HandsSource | undefined): void {
    this.group.visible = source !== undefined;
    this.keys.clear();
    if (!source) return;
    if (source.notes.left !== this.notes?.left || source.notes.right !== this.notes.right)
      this.replan(source.notes);
    for (const rig of this.rigs) {
      const hand = rig === this.rigs[0] ? "left" : "right";
      const track: Track = this.lanes[hand];
      // Hidden until the plan has reached the song's time.
      rig.pose(
        source.time <= knownUntil(track) ? sampleTrack(track, source.time, STUDIO_REST) : undefined
      );
      this.press(hand, rig, source);
    }
  }

  /** Stops the planner. */
  dispose(): void {
    this.cancel?.();
    this.cancel = undefined;
  }

  private replan(notes: HandsSource["notes"]): void {
    this.cancel?.();
    this.notes = notes;
    const lanes: Record<Hand, Lane> = { left: emptyLane(), right: emptyLane() };
    this.lanes = lanes;
    this.cancel = this.planner({ left: notes.left, right: notes.right }, (chunk) => {
      // A part of a cancelled plan never reaches the new lanes.
      if (this.lanes !== lanes) return;
      const lane = lanes[chunk.hand];
      lane.keys.push(...chunk.keys);
      lane.poses.push(...chunk.poses);
      lane.done = chunk.done;
    });
  }

  /** Keys go down with the tips that press them, as deep as the tips go. */
  private press(hand: Hand, rig: LiveRig, source: HandsSource): void {
    const X = rig.joints;
    if (!X) return;
    const t = source.time;
    for (const note of source.notes[hand]) {
      if (note.finger === undefined || t < note.start - READY || t > note.start + note.duration)
        continue;
      const target = keyTarget(note.pitch, note.finger, hand === "left");
      const tip = tipOf(X, note.finger);
      if (Math.abs(tip[0] - target.x) > (target.black ? 6.5 : WHITE_W / 2)) continue;
      const dip = Math.min(1, Math.max(0, (target.z - tip[2]) / KEY_DIP));
      this.keys.set(note.pitch, Math.max(this.keys.get(note.pitch) ?? 0, dip));
    }
  }
}
