import { readFileSync } from "node:fs";
import { Bone, Object3D, PropertyBinding, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { LiveRig } from "./liveHands";

interface GltfNode {
  readonly name: string;
  readonly children?: readonly number[];
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing node");
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

/** Where a bone's head is, in Blender's world (Z up, keys towards +Y). */
function head(rig: LiveRig, name: string): number[] {
  const scene = must(rig.space.children[0]);
  scene.updateMatrixWorld(true);
  const at = must(scene.getObjectByName(PropertyBinding.sanitizeNodeName(name))).getWorldPosition(
    new Vector3()
  );
  return [at.x, -at.z, at.y];
}

describe("LiveRig", () => {
  // Measured in Blender on the base pose (fingers-31) at its rig matrix.
  it.each([
    ["wrist.R", [0.3973, 0.1925, 0.7942]],
    ["finger1-3.R", [0.3658, 0.2841, 0.7515]],
    ["finger2-3.R", [0.3819, 0.3451, 0.7557]],
    ["finger5-3.R", [0.4547, 0.3143, 0.752]]
  ])("puts %s where Blender has it", (name, expected) => {
    const rig = new LiveRig(skeleton(), "right");
    console.log(
      name,
      head(rig, name)
        .map((v) => v.toFixed(4))
        .join(" ")
    );
    head(rig, name).forEach((value, axis) => {
      expect(value).toBeCloseTo(expected[axis] ?? 0, 3);
    });
  });

  it("lays the forearm behind the wrist, towards the player", () => {
    const rig = new LiveRig(skeleton(), "right");
    const note = { duration: 0.5, pitch: 67, finger: 3 as const, start: 0 };
    rig.update({ time: 0, notes: { left: [], right: [note] } }, 1 / 60);
    const [wx = 0, wy = 0, wz = 0] = head(rig, "wrist.R");
    const [ex = 0, ey = 0, ez = 0] = head(rig, "lowerarm02.R");
    // Blender's world: the player sits towards -Y; the forearm leaves at most 20° off straight.
    expect(wy - ey).toBeGreaterThan(0.06);
    expect(Math.abs(wx - ex)).toBeLessThan((wy - ey) * Math.tan(Math.PI / 9));
    expect(wz).toBeGreaterThan(ez);
  });

  it("lets a repeated note's key come up between the strikes", () => {
    const rig = new LiveRig(skeleton(), "right");
    const note = { duration: 0.5, pitch: 60, finger: 1 as const };
    const source = (time: number) => ({
      time,
      notes: {
        left: [],
        right: [
          { ...note, start: 0 },
          { ...note, start: 0.5 }
        ]
      }
    });
    const dips: [number, number][] = [];
    for (let time = -0.3; time <= 0.8; time += 1 / 120) {
      const keys = new Map<number, number>();
      rig.update(source(time), 1 / 120);
      rig.press(time, keys);
      dips.push([time, keys.get(60) ?? 0]);
    }
    const between = dips.filter(([time]) => time > 0.3 && time < 0.5).map(([, dip]) => dip);
    const held = dips.filter(([time]) => time > 0.1 && time < 0.3).map(([, dip]) => dip);
    expect(Math.max(...held)).toBeGreaterThan(0.9);
    expect(Math.min(...between)).toBeLessThan(0.3);
  });
});
