import { loadSceneModels } from "./handScene.testSupport";
import { readFileSync } from "node:fs";
import { Bone, Matrix4, Object3D, PropertyBinding, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { planChunks } from "./handSolver/chunks";
import type { Library } from "./handSolver/library";
import { CHAIN, FINGERS, at, handJoints } from "./handSolver/mech";
import type { Vec3 } from "./handSolver/mech";
import { planHand, strikesOf } from "./handSolver/plan";
import type { FingeredNote } from "./handSolver/plan";
import { STUDIO_BONES, STUDIO_REST } from "./handSolver/rest";
import { sampleTrack, trackPose } from "./handSolver/track";
import type { Track } from "./handSolver/track";
import { LiveHands, LiveRig } from "./liveHands";
import type { Planner } from "./liveHands";

const LIB = library as unknown as Library;

interface GltfNode {
  readonly name: string;
  readonly children?: readonly number[];
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
}

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("missing value");
  return value;
}

/** The hand.glb node tree without its meshes: what the rig poses. */
function skeleton(): Object3D {
  const glb = readFileSync("public/models/hand.glb");
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()) as {
    nodes: GltfNode[];
  };
  const objects = json.nodes.map((node) => {
    const object = node.name.endsWith(".R") ? new Bone() : new Object3D();
    // As GLTFLoader names them.
    object.name = PropertyBinding.sanitizeNodeName(node.name);
    if (node.translation) object.position.set(...node.translation);
    if (node.rotation) object.quaternion.set(...node.rotation);
    return object;
  });
  json.nodes.forEach((node, index) => {
    for (const child of node.children ?? []) objects[index]?.add(must(objects[child]));
  });
  const root = new Object3D();
  root.add(must(objects.find((object) => object.name === "HandRig")));
  return root;
}

const gltf = (v: Vec3) => new Vector3(v[0], v[2], -v[1]);
const node = (scene: Object3D, name: string) =>
  must(scene.getObjectByName(PropertyBinding.sanitizeNodeName(name)));

const RIGHT_LINE: FingeredNote[] = [
  { start: 0, duration: 0.25, pitch: 60, finger: 1 },
  { start: 0.3, duration: 0.25, pitch: 64, finger: 3 },
  { start: 0.6, duration: 0.25, pitch: 67, finger: 5 },
  { start: 0.9, duration: 0.25, pitch: 61, finger: 2 }
];

function trackOf(notes: readonly FingeredNote[]): Track {
  const plan = planHand(STUDIO_REST, LIB, "right", strikesOf(notes, "right"));
  return { keys: plan.keys, poses: plan.poses.map(trackPose), done: true };
}

describe("studio rest", () => {
  it("is where hand.glb has the bones", () => {
    const scene = skeleton();
    const rig = node(scene, "HandRig");
    rig.matrix.identity();
    rig.matrixAutoUpdate = false;
    scene.updateMatrixWorld(true);
    const inRig = new Matrix4().copy(rig.matrixWorld).invert();
    for (const [name, bone] of Object.entries(STUDIO_BONES)) {
      const head = node(scene, name).getWorldPosition(new Vector3()).applyMatrix4(inRig);
      // Within 0.1 mm (Blender units are metres).
      expect(head.distanceTo(gltf(bone.head))).toBeLessThan(1e-4);
    }
  });
});

describe("LiveRig", () => {
  it("puts every phalanx of the rig on the solver's joints", () => {
    const track = trackOf(RIGHT_LINE);
    const rig = new LiveRig(skeleton(), "right");
    for (const t of [0, 0.15, 0.3, 0.45, 0.6, 0.9]) {
      const hand = must(sampleTrack(track, t, STUDIO_REST));
      rig.pose(hand);
      const X = handJoints(STUDIO_REST, hand.angles, hand.root);
      const scene = must(rig.space.children[0]);
      scene.updateMatrixWorld(true);
      const want = (i: number) => gltf(at(X, i)).multiplyScalar(0.001);
      for (const f of FINGERS)
        for (let j = 0; j < 3; j++) {
          const name = `finger${String(f)}-${String(j + 1)}.R`;
          const bone = node(scene, name);
          const head = bone.getWorldPosition(new Vector3());
          const length = must(STUDIO_BONES[name]).length;
          const tail = new Vector3(0, length, 0).applyMatrix4(bone.matrixWorld);
          // Within a millimetre: the rig's rest is the solver's.
          expect(head.distanceTo(want(at(CHAIN[f], j)))).toBeLessThan(1e-3);
          expect(tail.distanceTo(want(at(CHAIN[f], j + 1)))).toBeLessThan(1e-3);
        }
      expect(
        node(scene, "wrist.R").getWorldPosition(new Vector3()).distanceTo(want(0))
      ).toBeLessThan(1e-3);
    }
  });

  it("lays the forearm behind the wrist, towards the player", () => {
    const rig = new LiveRig(skeleton(), "right");
    rig.pose(sampleTrack(trackOf(RIGHT_LINE), 0.6, STUDIO_REST));
    const scene = must(rig.space.children[0]);
    scene.updateMatrixWorld(true);
    const wrist = node(scene, "wrist.R").getWorldPosition(new Vector3());
    const elbow = node(scene, "lowerarm02.R").getWorldPosition(new Vector3());
    // glTF axes: the player sits towards +Z; the forearm leaves at most 20° off straight.
    expect(elbow.z - wrist.z).toBeGreaterThan(0.06);
    expect(Math.abs(wrist.x - elbow.x)).toBeLessThan((elbow.z - wrist.z) * Math.tan(Math.PI / 9));
    expect(wrist.y).toBeGreaterThan(elbow.y);
  });

  it("bends the thumb's phalanges without twisting one against the next", () => {
    const track = trackOf(RIGHT_LINE);
    const rig = new LiveRig(skeleton(), "right");
    const scene = must(rig.space.children[0]);
    const bones = [2, 3].map((j) => node(scene, `finger1-${String(j)}.R`));
    const rest = bones.map((bone) => bone.quaternion.clone());
    for (const t of [0, 0.15, 0.3, 0.45, 0.6, 0.9]) {
      rig.pose(must(sampleTrack(track, t, STUDIO_REST)));
      bones.forEach((bone, i) => {
        // The turn about the bone's own axis (Y), against its parent, beyond the rest's.
        const q = must(rest[i]).clone().invert().multiply(bone.quaternion);
        const twist = Math.abs((2 * Math.atan2(q.y, q.w) * 180) / Math.PI);
        expect(Math.min(twist, 360 - twist)).toBeLessThan(5);
      });
    }
  });

  it("hides without a pose", () => {
    const rig = new LiveRig(skeleton(), "right");
    rig.pose(undefined);
    expect(rig.space.visible).toBe(false);
  });
});

/** A planner on this thread, all at once. */
const syncPlanner: Planner = (notes, onChunk) => {
  for (const chunk of planChunks(STUDIO_REST, LIB, notes, () => false)) onChunk(chunk);
  return () => undefined;
};

describe("LiveHands", () => {
  let model: Object3D;
  beforeAll(async () => {
    model = (await loadSceneModels()).hand;
  });
  it("hides the hands until the plan reaches the song's time", () => {
    let deliver: (() => void) | undefined;
    const late: Planner = (notes, onChunk) => {
      deliver = () => void syncPlanner(notes, onChunk);
      return () => undefined;
    };
    const hands = new LiveHands(skeleton(), late);
    const source = { time: 0.3, notes: { left: [], right: RIGHT_LINE } };
    hands.update(source);
    expect(hands.group.children.map((c) => c.visible)).toEqual([false, false]);
    must(deliver)();
    hands.update(source);
    // The left hand plays nothing; the right is planned.
    expect(hands.group.children.map((c) => c.visible)).toEqual([false, true]);
  });

  it("lets a repeated note's key come up between the strikes", { timeout: 15000 }, () => {
    const hands = new LiveHands(model, syncPlanner);
    const note = { duration: 0.5, pitch: 60, finger: 1 as const };
    const notes = { left: [], right: [0, 0.5].map((start) => ({ ...note, start })) };
    const dips: [number, number][] = [];
    for (let time = -0.3; time <= 0.8; time += 1 / 120) {
      hands.update({ time, notes });
      dips.push([time, hands.keys.get(60)?.drop ?? 0]);
    }
    const between = dips.filter(([time]) => time > 0.3 && time < 0.5).map(([, dip]) => dip);
    const held = dips.filter(([time]) => time > 0.1 && time < 0.3).map(([, dip]) => dip);
    const depth = Math.max(...held);
    expect(depth).toBeGreaterThan(1);
    expect(Math.min(...between)).toBeLessThan(depth * 0.3);
  });
});

describe("an active hand player", () => {
  it("lifts the final attached hand and releases its key after the source duration, including seeks", () => {
    const planner: Planner = (notes, deliver, context) => {
      for (const chunk of planChunks(
        context?.rest ?? STUDIO_REST,
        LIB,
        notes,
        () => false,
        context?.timing
      ))
        deliver(chunk);
      return () => undefined;
    };
    const hands = new LiveHands(skeleton(), planner);
    hands.layout({ pitch: 60, x: 0, width: 23.5 });
    hands.setPlayer({ rest: { left: STUDIO_REST, right: STUDIO_REST }, pose: () => undefined });
    const notes = {
      left: [],
      right: [{ start: 0, duration: 0.25, pitch: 60, finger: 1 as const }]
    };
    hands.update({ time: 0.2, notes });
    const pressedZ = hands.poses.right?.root[5];
    expect(hands.keys.get(60)?.drop).toBeGreaterThan(0);
    hands.update({ time: 0.4, notes });
    const releasedZ = hands.poses.right?.root[5];
    expect(releasedZ).toBeCloseTo((pressedZ ?? 0) + 20, 8);
    expect(hands.keys.has(60)).toBe(false);
    hands.update({ time: 0.2, notes });
    expect(hands.poses.right?.root[5]).toBe(pressedZ);
    hands.update({ time: 0.4, notes });
    expect(hands.poses.right?.root[5]).toBe(releasedZ);
    hands.dispose();
  });

  it("switches anatomy through the same planner and restores studio hands", () => {
    const profile = {
      left: STUDIO_REST,
      right: { ...STUDIO_REST, len: { ...STUDIO_REST.len, 2: [40, 36.5, 27.8] as const } }
    };
    const planned: unknown[] = [];
    let cancelled = 0;
    const planner: Planner = (notes, deliver, context) => {
      planned.push(context?.rest);
      for (const chunk of planChunks(context?.rest ?? STUDIO_REST, LIB, notes, () => false))
        deliver(chunk);
      return () => {
        cancelled++;
      };
    };
    const poses: unknown[] = [];
    const player = {
      rest: profile,
      pose: (pose: unknown) => {
        poses.push(pose);
      }
    };
    const hands = new LiveHands(skeleton(), planner);
    const source = { time: 0.4, notes: { left: [], right: RIGHT_LINE } };
    hands.layout({ pitch: 60, x: 0, width: 23.5 });
    hands.update(source);
    expect(hands.group.visible).toBe(true);
    hands.setPlayer(player);
    hands.update(source);
    expect(cancelled).toBe(1);
    expect(planned.at(-1)).toBe(profile);
    expect(hands.group.visible).toBe(false);
    expect(poses).toHaveLength(1);
    expect(hands.poses.right).toBeDefined();
    const before = planned.length;
    hands.setPlayer(player);
    hands.update(source);
    expect(planned).toHaveLength(before);
    hands.setPlayer(undefined);
    hands.update(source);
    expect(cancelled).toBe(2);
    expect(hands.group.visible).toBe(true);
    expect(planned.at(-1)).toBeUndefined();
    hands.dispose();
    expect(cancelled).toBe(3);
  });

  it("rejects stale profile chunks and clears external poses with no source", () => {
    const chunks: (() => void)[] = [];
    const planner: Planner = (notes, deliver, context) => {
      chunks.push(() => {
        for (const chunk of planChunks(context?.rest ?? STUDIO_REST, LIB, notes, () => false))
          deliver(chunk);
      });
      return () => undefined;
    };
    let received: unknown;
    const player = {
      rest: { left: STUDIO_REST, right: STUDIO_REST },
      pose: (pose: unknown) => {
        received = { ...(pose as object) };
      }
    };
    const hands = new LiveHands(skeleton(), planner);
    const source = { time: 0.4, notes: { left: [], right: RIGHT_LINE } };
    hands.update(source);
    hands.setPlayer(player);
    hands.update(source);
    must(chunks[0])();
    hands.update(source);
    expect(hands.poses.right).toBeUndefined();
    must(chunks[1])();
    hands.update(source);
    expect(hands.poses.right).toBeDefined();
    hands.update(undefined);
    expect(received).toEqual({ left: undefined, right: undefined });
    expect(hands.keys.size).toBe(0);
    hands.dispose();
  });
});

it("suspends streaming, rejects late chunks and replans the identical notes on fallback return", () => {
  const deliveries: (() => void)[] = [];
  let cancelled = 0;
  const planner: Planner = (notes, deliver) => {
    deliveries.push(() => {
      for (const chunk of planChunks(STUDIO_REST, LIB, notes, () => false)) deliver(chunk);
    });
    return () => {
      cancelled++;
    };
  };
  const hands = new LiveHands(skeleton(), planner);
  const source = { time: 0.1, notes: { left: [], right: RIGHT_LINE } };
  hands.update(source);
  hands.keys.set(60, { drop: 8, along: 90 });
  hands.suspend();
  hands.suspend();
  expect(cancelled).toBe(1);
  expect(hands.group.visible).toBe(false);
  expect(hands.keys.size).toBe(0);
  must(deliveries[0])();
  hands.update(source);
  expect(deliveries).toHaveLength(2);
  expect(hands.poses.right).toBeUndefined();
  must(deliveries[1])();
  hands.update(source);
  expect(hands.poses.right).toBeDefined();
  hands.dispose();
  expect(cancelled).toBe(2);
});
