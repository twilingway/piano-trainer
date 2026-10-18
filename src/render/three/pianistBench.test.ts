import { existsSync, readFileSync } from "node:fs";
import { AnimationClip, Bone, Box3, Group, Mesh, Vector3, VectorKeyframeTrack } from "three";
import type { BufferGeometry, Material, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import { Pianist, PIANIST_TRIAL_CLIP } from "./pianist";
import { pianistBenchPose } from "./pianistBench";
import { pianistBenchLayout } from "./pianistBenchLayout";
import type { BenchPose } from "./pianistBenchLayout";

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a seated rig and bench");
  return value;
}

function skeleton(): Group {
  const scene = new Group();
  scene.name = "SeatedRig";
  for (const [name, position] of [
    ["pelvis", [0.08, -0.15, 0.48]],
    ["thighL", [-0.02, -0.15, 0.48]],
    ["thighR", [0.18, -0.15, 0.48]],
    ["shinL", [-0.05, -0.24, 0.06]],
    ["shinR", [0.21, -0.25, 0.08]],
    ["footL", [-0.08, -0.65, 0.01]],
    ["footR", [0.24, -0.65, -0.04]]
  ] as const) {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(position[0], position[1], position[2]);
    scene.add(bone);
  }
  return scene;
}

/** Measures the actual rounded mesh in the common metre-space, including parent transforms. */
function cushionBounds(pianist: Pianist): Box3 {
  const mesh = must(pianist.bench?.group.getObjectByName("PianistBenchCushion"));
  if (!(mesh instanceof Mesh)) throw new Error("Expected cushion mesh");
  pianist.space.updateWorldMatrix(true, true);
  const positions = (mesh.geometry as BufferGeometry).getAttribute("position");
  const box = new Box3();
  for (let i = 0; i < positions.count; i++) {
    const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(pianist.space.worldToLocal(point));
  }
  return box;
}

function assertSeat(pianist: Pianist, pose: BenchPose): void {
  const box = cushionBounds(pianist);
  const kneeY = (pose.leftKnee.y + pose.rightKnee.y) / 2;
  expect(box.max.y - kneeY).toBeGreaterThanOrEqual(-1e-7);
  expect(box.max.y - kneeY).toBeLessThanOrEqual(0.05 + 1e-7);
  expect(box.max.y).toBeLessThan(pose.pelvis.y);
  expect(box.min.z).toBeCloseTo(
    (pose.leftHip.z + pose.rightHip.z + pose.leftKnee.z + pose.rightKnee.z) / 4,
    6
  );
  for (const point of [pose.pelvis, pose.leftHip, pose.rightHip]) {
    expect(point.x).toBeGreaterThan(box.min.x);
    expect(point.x).toBeLessThan(box.max.x);
    expect(point.z).toBeGreaterThan(box.min.z);
    expect(point.z).toBeLessThan(box.max.z);
  }
}

function visible(root: Object3D, object: Object3D): boolean {
  let found = false;
  root.traverseVisible((node) => {
    if (node === object) found = true;
  });
  return found;
}

describe("pianist bench", () => {
  it("seats the posed rig before sampling, following keyboard scale and parent movement", () => {
    const scene = skeleton();
    const clip = new AnimationClip("Seat", 8, [
      new VectorKeyframeTrack("SeatedRig.position", [0, 8], [0.12, 0.04, 0.1, 0, 0, 0])
    ]);
    const pianist = new Pianist({ scene, clip });
    const pose = must(pianistBenchPose(scene, pianist.space));
    expect(pose.pelvis.x).toBeCloseTo(0.2);
    expect(must(pianist.bench).layout.x).toBeCloseTo(0.2);
    const parent = new Group();
    parent.position.set(-210, 80, 25);
    parent.rotation.y = 0.3;
    parent.add(pianist.space);
    for (const width of [18.5, 23.5, 28]) {
      pianist.layout({ pitch: 64, x: 150, width });
      assertSeat(pianist, pose);
      const pelvis = must(scene.getObjectByName("pelvis")).getWorldPosition(new Vector3());
      const cushion = must(pianist.bench).group.getWorldPosition(new Vector3());
      expect((pelvis.y - cushion.y) / pianist.space.scale.y).toBeCloseTo(0.07, 6);
    }
    pianist.dispose();
  });

  it("clamps the cushion to the specified knee interval", () => {
    const pose = must(pianistBenchPose(skeleton(), new Group()));
    for (const [height, expected] of [
      [-0.21, -0.245],
      [0.1, -0.195]
    ] as const) {
      const layout = must(pianistBenchLayout({ ...pose, pelvis: { ...pose.pelvis, y: height } }));
      expect(layout.top).toBeCloseTo(expected);
    }
  });

  it("hides together with the pianist and has no independent visibility switch", () => {
    const pianist = new Pianist({ scene: skeleton(), clip: undefined });
    const bench = must(pianist.bench);
    expect(visible(pianist.space, bench.group)).toBe(true);
    pianist.space.visible = false;
    expect(visible(pianist.space, bench.group)).toBe(false);
    pianist.space.visible = true;
    expect(visible(pianist.space, bench.group)).toBe(true);
    pianist.dispose();
  });

  it("keeps a model without the required bones working without a bench", () => {
    const scene = skeleton();
    must(scene.getObjectByName("shinL")).removeFromParent();
    expect(new Pianist({ scene, clip: undefined }).bench).toBeUndefined();
    expect(new Pianist({ scene: new Group(), clip: undefined }).bench).toBeUndefined();
  });

  it("rejects invalid and non-seated points", () => {
    const pose = must(pianistBenchPose(skeleton(), new Group()));
    expect(pianistBenchLayout({ ...pose, pelvis: { ...pose.pelvis, x: NaN } })).toBeUndefined();
    expect(pianistBenchLayout({ ...pose, pelvis: { ...pose.pelvis, y: -0.3 } })).toBeUndefined();
    expect(pianistBenchLayout({ ...pose, pelvis: { ...pose.pelvis, z: 0 } })).toBeUndefined();
  });

  it("frees every shared geometry and material once when its owner is disposed", () => {
    const pianist = new Pianist({ scene: skeleton(), clip: undefined });
    const bench = must(pianist.bench);
    const resources = new Set<{ dispose(): void }>();
    bench.group.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      resources.add(node.geometry as BufferGeometry);
      for (const material of (Array.isArray(node.material)
        ? node.material
        : [node.material]) as Material[])
        resources.add(material);
    });
    const dispose = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
    expect(resources.size).toBe(5);
    pianist.dispose();
    pianist.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1);
    expect(bench.group.parent).toBeNull();
  });
});

/** Rebuilds the GLB with plain materials: no personal image is decoded or copied to a fixture. */
async function localPianist() {
  const bytes = readFileSync("local-models/pianist.glb");
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength)) as {
    materials?: unknown[];
    images?: unknown[];
    textures?: unknown[];
  };
  json.materials = json.materials?.map(() => ({})) ?? [];
  delete json.images;
  delete json.textures;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(padded);
  const binary = bytes.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return new GLTFLoader().parseAsync(
    new Uint8Array(Buffer.concat([header, padded, binary])).buffer,
    ""
  );
}

it.skipIf(!existsSync("local-models/pianist.glb"))(
  "places the cushion under the real private pianist's pelvis and thighs",
  async () => {
    const model = await localPianist();
    const clip = must(model.animations.find((item) => item.name === PIANIST_TRIAL_CLIP));
    const pianist = new Pianist({ scene: model.scene, clip });
    const pose = must(pianistBenchPose(model.scene, pianist.space));
    for (const width of [18.5, 23.5, 28]) {
      pianist.layout({ pitch: 60, x: 75, width });
      assertSeat(pianist, pose);
    }
    const box = cushionBounds(pianist);
    const aboveKneesMm = 1000 * (box.max.y - (pose.leftKnee.y + pose.rightKnee.y) / 2);
    expect(aboveKneesMm).toBeCloseTo(16.746, 2);
    console.info("Private pianist bench: top above knees (mm), front (m)", aboveKneesMm, box.min.z);
    pianist.dispose();
  }
);
