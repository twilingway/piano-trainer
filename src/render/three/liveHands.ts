import { Bone, Group, LinearSRGBColorSpace, Matrix4, Mesh, PropertyBinding } from "three";
import type { BufferGeometry, MeshStandardMaterial, Object3D, Quaternion } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { SongBeat } from "../../song/song";
import type { SourcePerformanceIdentity } from "../../song/sourcePerformance";
import type { Finger, Hand } from "../../fingering/fingering";
import type { HandNotes, HandRests, PlanChunk } from "./handSolver/chunks";
import {
  BLACK_TOP,
  CHAIN,
  FINGERS,
  KEY_DIP,
  R_FINGER,
  TIP_ABOVE,
  at,
  handJoints,
  isBlack,
  keyUnder,
  tipOf,
  whitePosition
} from "./handSolver/mech";
import type { Vec3 } from "./handSolver/mech";
import type { FingeredNote, PlanKey, PlanTiming } from "./handSolver/plan";
import { STUDIO_REST } from "./handSolver/rest";
import { knownUntil } from "./handSolver/track";
import type { HandAt, Track, TrackPose } from "./handSolver/track";
import {
  BoneFrame,
  SOLVER_TO_GLTF,
  aimForearm,
  armToWorld,
  handSpaceLayout,
  solverPoint
} from "./handPose";
import { HandSkin } from "./handSkin";
import { KIT_DEPTH } from "./pianoKit";
import { keyDrive, keyDriveFront, keyFrontDip } from "./handContact";
import { fitScenePose, sampleSceneTrack } from "./handScenePose";
import type { SkinGeometry } from "./skinGeometry";

/** What the hands play: the song's notes of each hand and the song time now. */
export interface HandsSource {
  readonly time: number;
  readonly beats?: readonly SongBeat[] | undefined;
  readonly performance?: SourcePerformanceIdentity | undefined;
  readonly notes: Readonly<Record<Hand, readonly FingeredNote[]>>;
}

/** Plans the hands' notes somewhere and hands the plan on in parts; returns a cancel. */
export interface ScenePlanChunk extends PlanChunk {
  /** Scene contact was fitted off the frame loop by the worker. */
  readonly sceneFit?: boolean;
}

export interface ScenePlanContext {
  readonly timing?: PlanTiming;
  readonly rest?: HandRests;
  readonly skin?: Readonly<Record<Hand, SkinGeometry | undefined>>;
}

export type Planner = (
  notes: HandNotes,
  onChunk: (chunk: ScenePlanChunk) => void,
  context?: ScenePlanContext
) => () => void;

/** The plan in a worker, off the frame loop. */
export const workerPlanner: Planner = (notes, onChunk, context) => {
  const worker = new Worker(new URL("./handPlan.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<ScenePlanChunk>) => {
    onChunk(event.data);
  };
  worker.onerror = (error) => {
    console.warn("3D hands: the plan failed", error);
  };
  worker.postMessage({ notes, ...context });
  return () => {
    worker.terminate();
  };
};

/** Mm into the keys: the solver keyboard's length. */
const KEY_LENGTH = 150;
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

/** One hand of the studio rig, its bones set on the solver's joints every frame. */
export class LiveRig {
  /** Places the solver's world on the keys: metres in glTF axes, C4's centre, the white front and top
   * at the origin; mirrored for the left hand. */
  readonly space = new Group();
  private readonly rig: Object3D;
  private readonly frame: BoneFrame;
  private readonly phalanges: Phalanx[] = [];
  private readonly arm: Bone;
  private readonly wrist: Bone;
  /** The wrist on the forearm at rest: its turn and how far from the forearm's head. */
  private readonly wristRest: Quaternion;
  private readonly wristOnArm: number;
  readonly skin: HandSkin;
  readonly geometry: SkinGeometry | undefined;
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
    this.frame = new BoneFrame(rig);
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
    this.space.add(scene);
    this.space.visible = false;
    this.skin = new HandSkin(this.space, new Map(this.phalanges.map((p) => [p.bone, p.finger])));
    const calibration: HandAt = {
      root: [0, 10, -10, 0, -80, 40],
      angles: {
        1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
        2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
        5: { mcp: 20, pip: 30, dip: 20, abd: 0 }
      }
    };
    this.pose(calibration);
    this.geometry = this.skin.supportCount ? this.skin.bake(STUDIO_REST, calibration) : undefined;
    this.pose(undefined);
  }

  /** `c4` is C4's centre in the keys' group, `white` a white key across in its units. */
  layout(c4: number, white: number): void {
    handSpaceLayout(this.space, c4, white, this.hand);
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
    // Armature axes to solver world millimetres, then glTF metres.
    this.rig.matrix
      .copy(SOLVER_TO_GLTF)
      .multiply(new Matrix4().makeScale(0.001, 0.001, 0.001))
      .multiply(place)
      .multiply(SOLVER_TO_GLTF.clone().invert());
    this.rig.matrixWorldNeedsUpdate = true;
    this.rig.updateMatrixWorld(true);
    const toArm = new Matrix4().copy(this.rig.matrix).invert();
    const inArm = (p: Vec3) =>
      solverPoint([p[0] / 1000, p[1] / 1000, p[2] / 1000]).applyMatrix4(toArm);
    for (const p of this.phalanges) {
      p.bone.quaternion.copy(p.rest);
      p.bone.updateMatrixWorld(true);
    }
    for (const p of this.phalanges) {
      const chain = CHAIN[p.finger];
      this.frame.aim(p.bone, inArm(at(X, at(chain, p.joint + 1))));
    }
    aimForearm(this.frame, this.arm, this.wrist, this.wristRest, this.wristOnArm);
    this.skin.update(hand);
  }
}

/** A hand's plan as it arrives from the planner. */
interface Lane {
  keys: PlanKey[];
  poses: TrackPose[];
  done: boolean;
}

const emptyLane = (): Lane => ({ keys: [], poses: [], done: false });

/** A key a tip pushes down: how deep its top sinks under the tip and how far from the white front
 * that tip is, both in the keys' units. */
export interface KeyPress {
  readonly drop: number;
  readonly along: number;
}

/** A rig driven by the existing plan, with its own measured hand anatomy. */
export interface HandPlayer {
  readonly geometry?: Readonly<Record<Hand, SkinGeometry | undefined>>;
  readonly rest: HandRests;
  contact?(
    hand: Hand,
    finger: Finger,
    pitch: number
  ): { height: number; along: number } | undefined;
  pose(poses: Readonly<Record<Hand, HandAt | undefined>>, source?: HandsSource): void;
}

/** Both hands share one streamed plan, song time and key-contact calculation. */
export class LiveHands {
  private metric = false;
  readonly group = new Group();
  private readonly rigs: readonly LiveRig[];
  private lanes: Record<Hand, Lane> = { left: emptyLane(), right: emptyLane() };
  private notes: HandsSource["notes"] | undefined;
  private cancel: (() => void) | undefined;
  private player: HandPlayer | undefined;
  private readonly ends: Record<Hand, number> = { left: -Infinity, right: -Infinity };
  private readonly joints: Record<Hand, readonly Vec3[] | undefined> = {
    left: undefined,
    right: undefined
  };
  readonly poses: Record<Hand, HandAt | undefined> = { left: undefined, right: undefined };

  constructor(
    model: Object3D,
    private readonly planner: Planner = workerPlanner
  ) {
    this.rigs = [new LiveRig(model, "left"), new LiveRig(model, "right")];
    for (const rig of this.rigs) this.group.add(rig.space);
  }

  /** Changes anatomy once; stale chunks are invalid immediately, including before the next frame. */
  setPlayer(player: HandPlayer | undefined): void {
    if (this.player === player) return;
    this.cancel?.();
    this.cancel = undefined;
    this.notes = undefined;
    this.lanes = { left: emptyLane(), right: emptyLane() };
    this.poses.left = this.poses.right = undefined;
    this.player?.pose(this.poses);
    this.player = player;
    this.keys.clear();
  }

  layout(white: {
    readonly pitch: number;
    readonly x: number;
    readonly width: number;
    readonly metric?: boolean;
  }): void {
    this.metric = white.metric === true;
    const c4 = white.x - whitePosition(white.pitch) * white.width;
    for (const rig of this.rigs) {
      rig.layout(c4, white.width);
      if (white.metric) rig.space.scale.set(Math.sign(rig.space.scale.x) * 1000, 1000, 1000);
    }
  }

  readonly keys = new Map<number, KeyPress>();

  update(source: HandsSource | undefined): void {
    this.group.visible = source !== undefined && this.player === undefined;
    this.keys.clear();
    if (!source) {
      this.poses.left = this.poses.right = undefined;
      for (const rig of this.rigs) rig.pose(undefined);
      this.player?.pose(this.poses);
      return;
    }
    if (source.notes.left !== this.notes?.left || source.notes.right !== this.notes.right)
      this.replan(source.notes);
    for (const rig of this.rigs) {
      const hand = rig === this.rigs[0] ? "left" : "right";
      const track: Track = this.lanes[hand];
      const rest = this.player?.rest[hand] ?? STUDIO_REST;
      let pose =
        source.time <= knownUntil(track)
          ? sampleSceneTrack(
              track,
              source.time,
              rest,
              hand === "left",
              undefined,
              this.player?.geometry?.[hand] ?? rig.geometry
            )
          : undefined;
      if (pose && this.player && track.done && source.time > this.ends[hand]) {
        const u = Math.min(1, (source.time - this.ends[hand]) / 0.12);
        const lift = 20 * u * u * (3 - 2 * u);
        pose = {
          ...pose,
          root: [...pose.root.slice(0, 5), pose.root[5] + lift] as unknown as HandAt["root"]
        };
      }
      this.poses[hand] = pose;
      rig.pose(this.player ? undefined : pose);
      this.joints[hand] = pose ? handJoints(rest, pose.angles, pose.root) : undefined;
    }
    this.player?.pose(this.poses, source);
    for (const [i, hand] of (["left", "right"] as const).entries())
      this.press(hand, at(this.rigs, i), this.joints[hand], source);
  }

  /** Cancel streaming work and invalidate its notes before switching to a complete native clip. */
  suspend(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.notes = undefined;
    this.lanes = { left: emptyLane(), right: emptyLane() };
    this.poses.left = this.poses.right = undefined;
    this.keys.clear();
    this.group.visible = false;
  }

  dispose(): void {
    this.suspend();
  }

  private replan(notes: HandsSource["notes"]): void {
    this.cancel?.();
    this.notes = notes;
    for (const hand of ["left", "right"] as const)
      this.ends[hand] = notes[hand].reduce(
        (end, note) => Math.max(end, note.start + note.duration),
        -Infinity
      );
    const lanes: Record<Hand, Lane> = { left: emptyLane(), right: emptyLane() };
    this.lanes = lanes;
    this.cancel = this.planner(
      { left: notes.left, right: notes.right },
      (chunk) => {
        if (this.lanes !== lanes) return;
        const lane = lanes[chunk.hand];
        lane.keys.push(...chunk.keys);
        lane.poses.push(
          ...(chunk.sceneFit
            ? chunk.poses
            : chunk.poses.map((pose) =>
                fitScenePose(
                  pose,
                  this.player?.rest[chunk.hand] ?? STUDIO_REST,
                  chunk.hand,
                  undefined,
                  this.player?.geometry?.[chunk.hand] ??
                    at(this.rigs, chunk.hand === "left" ? 0 : 1).geometry
                )
              ))
        );
        lane.done = chunk.done;
      },
      {
        ...(this.player ? { rest: this.player.rest, timing: "score" as const } : {}),
        skin: this.player?.geometry ?? {
          left: at(this.rigs, 0).geometry,
          right: at(this.rigs, 1).geometry
        }
      }
    );
  }

  private press(
    hand: Hand,
    rig: LiveRig,
    X: readonly Vec3[] | undefined,
    source: HandsSource
  ): void {
    if (!X) return;
    const mirror = hand === "left",
      t = source.time;
    const track = this.lanes[hand];
    const next = track.keys.findIndex((key) => key.t > t);
    const key = track.keys[Math.max(0, next < 0 ? track.keys.length - 1 : next - 1)];
    const played = key ? track.poses[key.strike]?.pitches : undefined;
    for (const f of FINGERS) {
      const tip = tipOf(X, f);
      if (tip[1] < 0 || tip[1] > KEY_LENGTH) continue;
      const under = keyUnder(tip[0], tip[1], mirror).pitch;
      const getContact = (pitch: number) =>
        this.player?.contact
          ? this.player.contact(hand, f, pitch)
          : this.player
            ? { height: tip[2] - R_FINGER[f] * TIP_ABOVE, along: tip[1] }
            : rig.skin.contact(f, pitch, mirror);
      let pitch = played?.[f] ?? under;
      let contact = getContact(pitch);
      let depth = contact ? (isBlack(pitch) ? BLACK_TOP : 0) - contact.height : 0;
      // An upcoming READY note cannot steal pressure from the physical key still under the finger.
      if (depth <= 0 && pitch !== under) {
        pitch = under;
        contact = getContact(pitch);
        depth = contact ? (isBlack(pitch) ? BLACK_TOP : 0) - contact.height : 0;
      }
      if (!contact || depth <= 0) continue;
      if (this.metric) {
        const previous = this.keys.get(pitch);
        const drop = Math.min(8, depth);
        if (!previous || drop > previous.drop) this.keys.set(pitch, { drop, along: contact.along });
        continue;
      }
      const frontDip = Math.min(keyFrontDip(depth, contact.along), KEY_DIP);
      const previous = this.keys.get(pitch);
      if (!previous || frontDip > keyDriveFront(previous.drop, previous.along))
        this.keys.set(pitch, {
          drop: keyDrive(frontDip, contact.along),
          along: (contact.along * KIT_DEPTH) / 1000
        });
    }
  }
}
