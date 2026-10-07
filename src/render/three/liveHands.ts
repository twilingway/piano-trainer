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
import { HandSprings, knuckleSide, liveTarget } from "./handMotion";
import type { LiveHand } from "./handMotion";
import { STRIKE_S, planHand, whitePosition } from "./handPlacement";
import type { FingeredNote, HandPlan } from "./handPlacement";
import { ARM_SCALE, BASE, LIFTED, RIG } from "./handPoses";

/** What the hands play: the song's notes of each hand and the song time now. */
export interface HandsSource {
  readonly time: number;
  readonly notes: Readonly<Record<Hand, readonly FingeredNote[]>>;
}

// The solver's scene (tools/hand-rig/live_demo.py), in metres: C4's centre, the keys' front edge
// and top; a white key across.
const C4_X = 0.36;
const KEY_FRONT = 0.3;
const KEY_TOP = 0.74;
const WHITE_M = 0.0235;
/** The rig turns its knuckles sideways: about X for the thumb, Z for the rest; metres a radian. */
const SIDE_AXIS: Readonly<Record<Finger, Vector3>> = {
  1: new Vector3(1, 0, 0),
  2: new Vector3(0, 0, 1),
  3: new Vector3(0, 0, 1),
  4: new Vector3(0, 0, 1),
  5: new Vector3(0, 0, 1)
};
const SIDE_RADIUS: Readonly<Record<Finger, number>> = {
  1: 0.1,
  2: 0.075,
  3: 0.073,
  4: 0.075,
  5: 0.086
};
/** The straightening at the knuckle that brings a tip onto a black key. */
const BLACK_REACH = (15 * Math.PI) / 180;
const ONE = new Vector3(1, 1, 1);
const X_AXIS = new Vector3(1, 0, 0);
/** Into the keys, glTF axes: the player sits towards +Z. */
const INTO_KEYS = new Vector3(0, 0, -1);
/** How far the forearm keeps to the hand's line across the keys; the rest runs straight from the player. */
const FOREARM_WITH_HAND = 0.5;
/** The forearm rises this much a metre from the elbow to the wrist. */
const FOREARM_RISE = 0.1;
/** A finger touches its key only near the end of its way down; the key travels the rest. */
const TOUCH = 0.6;
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
/** Blender (Z up, keys towards +Y) to glTF (Y up): (x, y, z) → (x, z, -y). */
// prettier-ignore
const TO_GLTF = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1
);

export async function loadHand(): Promise<Object3D> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/hand.glb`);
  gltf.scene.traverse((node) => {
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
  return gltf.scene;
}

const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

interface Joint {
  readonly bone: Bone;
  readonly rest: Quaternion;
  readonly position: Vector3;
  readonly base: Quaternion;
  readonly location: Vector3;
  readonly lifted: Quaternion | undefined;
  readonly finger: Finger | undefined;
  /** Knuckle 0, then 1 and 2 towards the tip. */
  readonly joint: number;
}

/** A bone's name as GLTFLoader leaves it: without the dots. */
const nodeName = (name: string) => PropertyBinding.sanitizeNodeName(name);
const BASE_BY_NODE = new Map(Object.entries(BASE).map(([name, pose]) => [nodeName(name), pose]));
const LIFTED_BY_NODE = new Map(
  Object.entries(LIFTED).map(([name, pose]) => [nodeName(name), pose])
);

/** One hand of the studio rig, posed every frame by the live hand of `handMotion`. */
export class LiveRig {
  /** Places the solver's world on the keys; mirrored for the left hand. */
  readonly space = new Group();
  private readonly rig: Object3D;
  private readonly joints: Joint[] = [];
  private readonly rest: Matrix4;
  private readonly pivot = new Vector3();
  private readonly arm: Bone;
  private readonly wrist: Bone;
  /** The wrist on the forearm at rest: its turn and how far from the forearm's head. */
  private readonly wristRest: Quaternion;
  private readonly wristOnArm: number;
  private readonly springs = new HandSprings();
  private plan: HandPlan | undefined;
  private notes: readonly FingeredNote[] | undefined;
  private live: LiveHand | undefined;

  constructor(
    model: Object3D,
    private readonly hand: Hand
  ) {
    const scene = clone(model);
    const rig = scene.getObjectByName("HandRig");
    if (!rig) throw new Error("hand.glb has no HandRig");
    this.rig = rig;
    rig.matrixAutoUpdate = false;
    this.rest = TO_GLTF.clone()
      .multiply(new Matrix4().set(...(RIG as Parameters<Matrix4["set"]>)))
      .multiply(TO_GLTF.clone().invert());
    scene.traverse((node) => {
      if (!(node instanceof Bone)) return;
      const base = BASE_BY_NODE.get(node.name);
      if (!base) return;
      const finger = /^finger(\d)-/.exec(node.name)?.[1];
      const lifted = LIFTED_BY_NODE.get(node.name);
      this.joints.push({
        bone: node as Bone,
        rest: node.quaternion.clone(),
        position: node.position.clone(),
        base: new Quaternion(...(base.quaternion as [number, number, number, number])),
        location: new Vector3(...(base.location as [number, number, number])),
        lifted: lifted && new Quaternion(...(lifted as [number, number, number, number])),
        finger: finger === undefined ? undefined : (Number(finger) as Finger),
        joint: Number(/-(\d)R$/.exec(node.name)?.[1] ?? 1) - 1
      });
    });
    const arm = scene.getObjectByName(nodeName("lowerarm02.R"));
    const wrist = scene.getObjectByName(nodeName("wrist.R"));
    if (!(arm instanceof Bone) || !(wrist instanceof Bone)) throw new Error("hand.glb has no arm");
    this.arm = arm as Bone;
    this.wrist = wrist as Bone;
    this.wristRest = wrist.quaternion.clone();
    this.wristOnArm = wrist.position.length();
    // The pose's wrist hangs off a stretched forearm stub; placed in the rig, it takes no stretch.
    rig.add(wrist);
    // The rig turns about its wrist, as it sits in the base pose.
    this.rig.matrix.copy(this.rest);
    this.pose(undefined);
    scene.updateMatrixWorld(true);
    wrist.getWorldPosition(this.pivot);
    this.space.add(scene);
  }

  /** `c4` is C4's centre in the keys' group, `white` a white key across in its units. */
  layout(c4: number, white: number): void {
    const k = white / WHITE_M;
    const mirror = this.hand === "left" ? -1 : 1;
    this.space.scale.set(mirror * k, k, k);
    this.space.position.set(c4 - mirror * C4_X * k, 22 - KEY_TOP * k, KEY_FRONT * k);
  }

  /** How far each key under a finger is down, 0..1, into `keys`: it goes with the finger. */
  press(time: number, keys: Map<number, number>): void {
    const hand = this.live;
    if (!this.plan || !hand) return;
    for (const finger of [1, 2, 3, 4, 5] as const) {
      const dip = Math.min(1, Math.max(0, (hand.fingers[finger].bend[0] - TOUCH) / (1 - TOUCH)));
      for (const note of this.plan.fingers[finger]) {
        if (time < note.start - STRIKE_S || time > note.release + note.lift) continue;
        keys.set(note.pitch, Math.max(keys.get(note.pitch) ?? 0, dip));
      }
    }
  }

  update(source: HandsSource, deltaSeconds: number): void {
    const notes = source.notes[this.hand];
    if (notes !== this.notes) {
      this.notes = notes;
      this.plan = planHand(notes, this.hand);
    }
    this.space.visible = this.plan !== undefined;
    if (!this.plan) return;
    const hand = this.springs.step(liveTarget(this.plan, source.time), deltaSeconds);
    this.live = hand;
    this.pose(hand);
    this.place(hand);
  }

  /** Every joint between lifted and pressed by its bend; the knuckles turned sideways. */
  private pose(hand: LiveHand | undefined): void {
    const mirror = this.hand === "left" ? -1 : 1;
    const turn = new Quaternion();
    for (const joint of this.joints) {
      const q = joint.base.clone();
      const finger = joint.finger && hand?.fingers[joint.finger];
      if (joint.finger && finger && joint.lifted) {
        q.copy(joint.lifted).slerp(joint.base, finger.bend[joint.joint] ?? 0);
        if (joint.joint === 0) {
          const side = (mirror * knuckleSide(hand, joint.finger)) / 1000;
          q.multiply(
            turn.setFromAxisAngle(SIDE_AXIS[joint.finger], side / SIDE_RADIUS[joint.finger])
          );
          if (joint.finger !== 1)
            q.multiply(turn.setFromAxisAngle(X_AXIS, -BLACK_REACH * finger.depth));
        }
      }
      joint.bone.quaternion.copy(joint.rest).multiply(q);
      joint.bone.position.copy(joint.location).applyQuaternion(joint.rest).add(joint.position);
    }
    // The wrist in the rig: at the end of the pose's stretched forearm, turned with it. The mesh's
    // forearm runs to the elbow itself, so the bone takes no stretch.
    const arm = new Matrix4().compose(this.arm.position, this.arm.quaternion, ONE);
    const wrist = new Matrix4().compose(
      this.wrist.position.clone().multiply(new Vector3(...(ARM_SCALE as [number, number, number]))),
      this.wrist.quaternion,
      ONE
    );
    arm.multiply(wrist).decompose(this.wrist.position, this.wrist.quaternion, this.wrist.scale);
  }

  /** Slides the rig by the position and the wrist and turns it about the wrist. */
  private place(hand: LiveHand): void {
    // The left hand lives in a mirrored world: along the keyboard and the turns change sign.
    const mirror = this.hand === "left" ? -1 : 1;
    const { wrist } = hand;
    const p = this.pivot;
    this.rig.matrix
      .makeTranslation(
        mirror * hand.anchor * WHITE_M + (mirror * wrist.x) / 1000 + p.x,
        wrist.y / 1000 + p.y,
        -wrist.z / 1000 + p.z
      )
      .multiply(new Matrix4().makeRotationAxis(Y_AXIS, -mirror * wrist.yaw))
      .multiply(new Matrix4().makeRotationAxis(Z_AXIS, -mirror * wrist.roll))
      .multiply(new Matrix4().makeTranslation(-p.x, -p.y, -p.z))
      .multiply(this.rest);
    this.rig.matrixWorldNeedsUpdate = true;
    this.aimForearm();
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
  }
}

/** Both hands over the 3D keys. */
export class LiveHands {
  readonly group = new Group();
  private readonly rigs: readonly LiveRig[];

  constructor(model: Object3D) {
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

  update(source: HandsSource | undefined, deltaSeconds: number): void {
    this.group.visible = source !== undefined;
    this.keys.clear();
    if (!source) return;
    for (const rig of this.rigs) {
      rig.update(source, deltaSeconds);
      rig.press(source.time, this.keys);
    }
  }
}
