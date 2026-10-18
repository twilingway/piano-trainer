import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { describe, expect, it } from "vitest";
import { BoneFrame, solverPoint } from "./handPose";
import { CHAIN, at, handJoints } from "./handSolver/mech";
import type { Angles } from "./handSolver/mech";
import { PianistRig } from "./pianistRig";
import { pianistHandProfile } from "./pianistRigProfile";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
const ANGLES: Angles = {
  1: { cmc_radial: 20, cmc_palmar: 15, t_mcp: 25, t_ip: 20 },
  2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
  3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
  4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
  5: { mcp: 20, pip: 30, dip: 20, abd: 0 }
};

/** Deliberately different segment lengths and asymmetric hands, with real weighted cap vertices. */
function syntheticPianist(): Group {
  const scene = new Group();
  const add = (name: string, parent: Group | Bone, position: Vector3) => {
    const bone = new Bone();
    bone.name = name;
    bone.position.copy(position);
    parent.add(bone);
    return bone;
  };
  const pelvis = add("pelvis", scene, new Vector3(0, -0.15, 0.4));
  const spine = add("spine", pelvis, new Vector3());
  add("head", spine, new Vector3(0, 0.6, 0));
  add("footL", pelvis, new Vector3(-0.12, -0.5, 0.15));
  add("footR", pelvis, new Vector3(0.12, -0.5, 0.15));
  const ends = new Map<string, Bone[]>();
  for (const [side, mirror] of [
    ["L", -1],
    ["R", 1]
  ] as const) {
    const upper = add(`upper_arm${side}`, spine, new Vector3(mirror * 0.18, 0.5, 0));
    upper.rotation.x = Math.PI;
    const forearm = add(`forearm${side}`, upper, new Vector3(0, 0.29, 0));
    forearm.rotation.x = Math.PI / 2;
    const wrist = add(`hand${side}`, forearm, new Vector3(0, 0.25, 0));
    const tips: Bone[] = [];
    FINGERS.forEach((finger, i) => {
      const base = add(
        `${finger}_1${side}`,
        wrist,
        new Vector3(mirror * (i - 2) * 0.02, 0.08 + i * 0.003, 0)
      );
      base.rotation.x = 0.15;
      const middle = add(`${finger}_2${side}`, base, new Vector3(0, 0.035 + i * 0.002, 0));
      middle.rotation.x = 0.25;
      const tip = add(`${finger}_3${side}`, middle, new Vector3(0, 0.025 + i * 0.001, 0));
      tip.rotation.x = 0.2;
      tips.push(tip);
    });
    ends.set(side, tips);
  }
  scene.updateMatrixWorld(true);
  const bones: Bone[] = [];
  scene.traverse((node) => {
    if (node instanceof Bone) bones.push(node as Bone);
  });
  for (const [side, tips] of ends) {
    const positions: number[] = [];
    const indices: number[] = [];
    const weights: number[] = [];
    for (const tip of tips)
      for (const x of [-0.005, 0.005])
        for (const z of [-0.005, 0.005]) {
          const point = new Vector3(x, side === "L" ? 0.034 : 0.03, z).applyMatrix4(
            tip.matrixWorld
          );
          positions.push(...point.toArray());
          indices.push(bones.indexOf(tip), 0, 0, 0);
          weights.push(1, 0, 0, 0);
        }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    const glove = new SkinnedMesh(geometry, new MeshBasicMaterial());
    glove.name = `White_Closed_Glove_${side}`;
    scene.add(glove);
    glove.bind(new Skeleton(bones));
  }
  scene.updateMatrixWorld(true);
  return scene;
}

describe("PianistRig adapter", () => {
  it("rejects incomplete skeletons without changing their hierarchy", () => {
    const scene = syntheticPianist();
    const finger = scene.getObjectByName("thumb_3R");
    if (!finger) throw new Error("Fixture has no thumb");
    finger.name = "unsupported";
    const parent = finger.parent;
    expect(PianistRig.create(scene)).toBeUndefined();
    expect(finger.parent).toBe(parent);
  });

  it("derives each hand from its own geometry and aims every joint without stretching", () => {
    const scene = syntheticPianist();
    const profiles = {
      left: pianistHandProfile(scene, "left"),
      right: pianistHandProfile(scene, "right")
    };
    const rig = PianistRig.create(scene);
    if (!rig) throw new Error("Fixture rejected");
    rig.seat();
    expect(rig.rest.left.len[2][2] - rig.rest.right.len[2][2]).toBeCloseTo(4, 3);
    expect(rig.rest.right.len[2][0]).toBeCloseTo(37, 3);
    const saved = new Map<Bone, { parent: unknown; position: Vector3; scale: Vector3 }>();
    scene.traverse((node) => {
      if (node instanceof Bone)
        saved.set(node as Bone, {
          parent: node.parent,
          position: node.position.clone(),
          scale: node.scale.clone()
        });
    });
    const frame = new BoneFrame(scene);
    const pose = { root: [0, 10, -5, 160, -40, 55] as const, angles: ANGLES };
    rig.pose({ left: pose, right: pose });
    for (const hand of ["left", "right"] as const) {
      expect(rig.reachError[hand]).toBeLessThan(1e-8);
      const joints = handJoints(rig.rest[hand], pose.angles, pose.root);
      const point = (i: number) => {
        const p = at(joints, i);
        return solverPoint([p[0] * (hand === "left" ? -1 : 1), p[1], p[2]]).multiplyScalar(0.001);
      };
      for (const p of profiles[hand].phalanges) {
        const chain = CHAIN[p.finger];
        expect(frame.head(p.bone).distanceTo(point(at(chain, p.joint)))).toBeLessThan(1e-7);
        const normal = point(chain[1])
          .sub(point(chain[0]))
          .cross(point(chain[2]).sub(point(chain[1])))
          .normalize();
        expect(p.bendAxis.clone().applyQuaternion(frame.turn(p.bone)).angleTo(normal)).toBeLessThan(
          1e-6
        );
      }
    }
    for (const [bone, original] of saved) {
      expect(bone.parent).toBe(original.parent);
      expect(bone.position.toArray()).toEqual(original.position.toArray());
      expect(bone.scale.toArray()).toEqual(original.scale.toArray());
    }
  });

  it("keeps seated arms visible without a planned pose and restores the exact deterministic pose after a seek", () => {
    const scene = syntheticPianist();
    const rig = PianistRig.create(scene);
    if (!rig) throw new Error("Fixture rejected");
    rig.seat();
    const pose = { root: [0, 10, 0, 100, -40, 55] as const, angles: ANGLES };
    rig.pose({ left: pose, right: pose });
    const snapshot = () => {
      const values: number[] = [];
      scene.traverse((node) => {
        if (node instanceof Bone) values.push(...node.quaternion.toArray());
      });
      return values;
    };
    const before = snapshot();
    rig.pose({ left: undefined, right: undefined });
    expect(scene.getObjectByName("White_Closed_Glove_L")?.visible).toBe(true);
    expect(rig.joints.left).toBeUndefined();
    rig.pose({ left: pose, right: pose });
    expect(snapshot()).toEqual(before);
    expect(scene.getObjectByName("White_Closed_Glove_R")?.visible).toBe(true);
  });
  it("keeps the body continuous as wrists cross the previous grid-search boundary", () => {
    const scene = syntheticPianist();
    const rig = PianistRig.create(scene);
    const spine = scene.getObjectByName("spine");
    if (!rig || !spine) throw Error("Fixture rejected");
    rig.seat();
    let previous = spine.quaternion.clone();
    let maximum = 0;
    for (let i = 0; i <= 400; i++) {
      const d = 0.55 + i * 0.0001;
      rig.pose({
        left: { root: [0, 0, 0, -(d - 0.08) * 1000, -40, 55], angles: ANGLES },
        right: { root: [0, 0, 0, (d + 0.08) * 1000, -40, 55], angles: ANGLES }
      });
      if (i > 0) maximum = Math.max(maximum, spine.quaternion.angleTo(previous));
      previous = spine.quaternion.clone();
    }
    expect(maximum).toBeLessThan(0.01);
    rig.pose({ left: undefined, right: { root: [0, 0, 0, 100, -40, 55], angles: ANGLES } });
    expect(scene.getObjectByName("White_Closed_Glove_L")?.visible).toBe(true);
    expect(rig.joints.left).toBeUndefined();
    expect(rig.joints.right).toBeDefined();
  });
  it("moves head and left foot by song beats while preserving wrists and the pedal foot", () => {
    const scene = syntheticPianist();
    const rig = PianistRig.create(scene);
    const head = scene.getObjectByName("head"),
      foot = scene.getObjectByName("footL"),
      right = scene.getObjectByName("footR"),
      pelvis = scene.getObjectByName("pelvis");
    if (!rig || !head || !foot || !right || !pelvis) throw Error("Fixture rejected");
    rig.seat();
    const footBaseline = foot.quaternion.clone(),
      pedalBaseline = right.quaternion.clone(),
      pelvisPosition = pelvis.position.clone();
    const pose = { root: [0, 10, 0, 100, -40, 55] as const, angles: ANGLES };
    const beats = Array.from({ length: 12 }, (_, i) => ({
      time: i * 0.5,
      position: i,
      downbeat: i % 4 === 0
    }));
    const source = { time: 1.91, beats, notes: { left: [], right: [] } };
    rig.pose({ left: pose, right: pose }, source);
    const firstHead = head.quaternion.clone(),
      firstFoot = foot.quaternion.clone();
    expect(firstFoot.angleTo(footBaseline)).toBeGreaterThan(0.02);
    expect(right.quaternion.angleTo(pedalBaseline)).toBeLessThan(1e-8);
    expect(pelvis.position.toArray()).toEqual(pelvisPosition.toArray());
    const frame = new BoneFrame(scene);
    for (const hand of ["left", "right"] as const) {
      const wrist = scene.getObjectByName(hand === "left" ? "handL" : "handR");
      if (!wrist) throw new Error("Missing posed wrist");
      const p = handJoints(rig.rest[hand], pose.angles, pose.root)[0];
      if (!p) throw new Error("Missing solver wrist");
      const target = solverPoint([p[0] * (hand === "left" ? -1 : 1), p[1], p[2]]).multiplyScalar(
        0.001
      );
      expect(frame.head(wrist).distanceTo(target)).toBeLessThan(1e-7);
    }
    rig.pose({ left: pose, right: pose }, { ...source, time: 2.5 });
    rig.pose({ left: pose, right: pose }, source);
    expect(head.quaternion.angleTo(firstHead)).toBeLessThan(1e-7);
    expect(foot.quaternion.angleTo(firstFoot)).toBeLessThan(1e-7);
    rig.pose({ left: pose, right: pose }, source);
    expect(foot.quaternion.angleTo(firstFoot)).toBeLessThan(1e-7);
  });
});
