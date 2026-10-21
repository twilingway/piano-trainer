/** Numerical acceptance uses actual Three skinning; no browser, Vite, renderer or test config. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Mesh, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bindKeyboard88Visibility } from "../render/three/keyboard88Visibility.ts";
import type { Keyboard88Masks } from "../render/three/keyboard88Visibility.ts";
import { disposePianistModel } from "../render/three/disposePianistModel.ts";
import {
  keyboard88BoneFixture,
  LEFT_TIPS,
  RIGHT_TIPS
} from "../render/three/keyboard88Bones.testSupport.ts";
import { keyboard88At as at } from "../render/three/keyboard88Bones.ts";
import { Keyboard88Mirror } from "../render/three/keyboard88Mirror.ts";

const fixture = keyboard88BoneFixture();
const { rig, index, rotations, fk, mesh } = fixture;
const reference = readFileSync("tools/hand-rig/fixtures/keyboard88-bone-tips.bin");
assert.equal(reference.length, 1215 * 5 * 3 * 4);
const tip = new Vector3(),
  desired = new Vector3(),
  output = new Float32Array(208);
const mirror = new Keyboard88Mirror(rig);
const errors: number[] = [],
  armErrors: number[] = [],
  sourceKeyErrors: number[] = [];
const phases = ["before", "corrected", "mixed", "different"] as const;
type Phase = (typeof phases)[number];
const buckets = new Map(
  phases.map((phase) => [
    phase,
    {
      reflected: { physical: [] as number[], outside: [] as number[] },
      keyTop: { physical: [] as number[], outside: [] as number[] },
      unreachable: 0,
      unreachableRight: 0,
      unreachableLeft: 0,
      unreachablePhysicalLeft: 0,
      reachableRightDisplacement: [] as number[],
      rightKeyTop: [] as number[]
    }
  ])
);
const rightMixed: number[] = [];
function readReference(frame: number, finger: number, target: Vector3): Vector3 {
  const offset = (frame * 15 + finger * 3) * 4;
  return target.set(
    reference.readFloatLE(offset),
    reference.readFloatLE(offset + 4),
    reference.readFloatLE(offset + 8)
  );
}
function keyX(midi: number) {
  const blackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
  let steps = 0;
  if (midi >= 60) {
    for (let k = 60; k < midi; k++) if (!blackKey(k)) steps++;
  } else {
    for (let k = midi; k < 60; k++) if (!blackKey(k)) steps--;
  }
  return { x: 0.36 + (steps - (blackKey(midi) ? 0.5 : 0)) * 0.0235, black: blackKey(midi) };
}
function keyDistance(point: Vector3, midi: number): number {
  const { x, black } = keyX(midi),
    half = black ? 0.01331152 / 2 : 0.0225 / 2;
  const dx = Math.max(0, Math.abs(point.x - x) - half);
  const dy = point.y - ((black ? 0.752 : 0.74) - 0.008);
  const front = black ? -0.3557766 : -0.3,
    back = black ? -0.4498008 : -0.45;
  const dz = Math.max(0, point.z - front, back - point.z);
  return Math.hypot(dx, dy, dz) * 1000;
}
for (const [i, frame] of index.frames.entries()) {
  assert.equal(frame.id, 308 + i);
  fk.set(rotations, i * 208);
  for (const [finger, bone] of RIGHT_TIPS.entries()) {
    readReference(i, finger, desired);
    mesh.getVertexPosition(finger, tip).applyMatrix4(mesh.matrixWorld);
    errors.push(tip.distanceTo(desired) * 1000);
    armErrors.push(fk.tail(bone, tip).distanceTo(desired) * 1000);
    if (frame.pressedMask & (1 << finger))
      sourceKeyErrors.push(keyDistance(tip, at(frame.assignment, finger)));
  }
  const pose = rotations.subarray(i * 208, (i + 1) * 208);
  const other = (i + 607) % 1215;
  const options: Record<Phase, { torso?: boolean; correction?: boolean }> = {
    before: { torso: false, correction: false },
    corrected: { torso: false },
    mixed: {},
    different: {}
  };
  for (const mode of phases) {
    const bucket = buckets.get(mode);
    assert.ok(bucket);
    const right = mode === "different" ? rotations.subarray(other * 208, (other + 1) * 208) : pose;
    if (!mirror.compose(right, pose, output, options[mode])) bucket.unreachable++;
    if (mirror.unreachableMask & 1) bucket.unreachableRight++;
    if (mirror.unreachableMask & 2) {
      bucket.unreachableLeft++;
      if (
        frame.assignment.some(
          (midi, finger) =>
            frame.pressedMask & (1 << finger) && 100 - midi >= 21 && 100 - midi <= 108
        )
      )
        bucket.unreachablePhysicalLeft++;
    }
    if (mode === "mixed" || mode === "different") {
      const rightIndex = mode === "different" ? other : i;
      const rightFrame = at(index.frames, rightIndex);
      for (let finger = 0; finger < 5; finger++) {
        if (!(rightFrame.pressedMask & (1 << finger))) continue;
        readReference(rightIndex, finger, desired);
        mirror.skeleton.tail(at(RIGHT_TIPS, finger), tip);
        if (!(mirror.unreachableMask & 1))
          bucket.reachableRightDisplacement.push(tip.distanceTo(desired) * 1000);
        bucket.rightKeyTop.push(keyDistance(tip, at(rightFrame.assignment, finger)));
      }
    }
    for (let finger = 0; finger < 5; finger++) {
      if (!(frame.pressedMask & (1 << finger))) continue;
      readReference(i, finger, desired);
      desired.x = 0.438 - desired.x;
      mirror.skeleton.tail(at(LEFT_TIPS, finger), tip);
      const midi = 100 - at(frame.assignment, finger);
      const category = midi >= 21 && midi <= 108 ? "physical" : "outside";
      bucket.reflected[category].push(tip.distanceTo(desired) * 1000);
      bucket.keyTop[category].push(keyDistance(tip, midi));
      if (mode === "mixed") {
        readReference(i, finger, desired);
        mirror.skeleton.tail(at(RIGHT_TIPS, finger), tip);
        rightMixed.push(tip.distanceTo(desired) * 1000);
      }
    }
  }
}
function stats(values: number[]) {
  values.sort((a, b) => a - b);
  return {
    count: values.length,
    minMm: values[0] ?? 0,
    meanMm: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
    p50Mm: values[Math.floor(values.length * 0.5)] ?? 0,
    p95Mm: values[Math.floor(values.length * 0.95)] ?? 0,
    maxMm: values.at(-1) ?? 0
  };
}
const report = {
  frames: index.frames.length,
  bones: 52,
  anchors: RIGHT_TIPS.length,
  source:
    "Frozen Blender armature distal tails; exported GLB inverse binds; three.SkinnedMesh.getVertexPosition",
  skinning: stats(errors),
  armature: stats(armErrors),
  sourceRightBoneTailToPressedKeyTop: stats(sourceKeyErrors),
  rightTorsoDisplacement: stats(rightMixed),
  mirror: {
    metric:
      "Pressed distal tails: distance to D3 reflection of right Blender tail, and closest point of depressed key top rectangle. Bone anchors are not GN skin-pad contacts.",
    differentRightFrameOffset: 607,
    phases: Object.fromEntries(
      [...buckets].map(([name, bucket]) => [
        name,
        {
          unreachable: bucket.unreachable,
          unreachableRight: bucket.unreachableRight,
          unreachableLeft: bucket.unreachableLeft,
          unreachablePhysicalLeft: bucket.unreachablePhysicalLeft,
          reachableRightDisplacement: stats(bucket.reachableRightDisplacement),
          rightKeyTop: stats(bucket.rightKeyTop),
          reflectedTarget: {
            all: stats([...bucket.reflected.physical, ...bucket.reflected.outside]),
            physical: stats(bucket.reflected.physical),
            outside: stats(bucket.reflected.outside)
          },
          keyTop: { physical: stats(bucket.keyTop.physical), outside: stats(bucket.keyTop.outside) }
        }
      ])
    )
  }
};
writeFileSync(
  ".scratch/keyboard88-bones-verification.json",
  JSON.stringify(report, null, 2) + "\n"
);
assert.equal(report.frames, 1215);
assert.ok(
  report.skinning.maxMm <= 0.5,
  `Skinned bone anchors ${String(report.skinning.maxMm)} mm > .5 mm`
);
assert.ok(report.armature.maxMm <= 0.5);
for (const phase of ["mixed", "different"] as const) {
  const result = report.mirror.phases[phase];
  assert.ok(result);
  assert.equal(result.keyTop.physical.count, 2060);
  assert.ok(result.keyTop.physical.maxMm <= 35, `${phase}: left key-top >35mm`);
  assert.equal(result.unreachablePhysicalLeft, 0);
  assert.ok(result.reachableRightDisplacement.maxMm < 0.01);
}
console.log(
  `KEYBOARD88_BONES_PASS ${String(report.frames)} frames / ${String(errors.length)} anchors; skinned max ${report.skinning.maxMm.toFixed(6)} mm; FK max ${report.armature.maxMm.toFixed(6)} mm`
);
console.log(JSON.stringify(report.mirror, null, 2));
fixture.dispose();

// Exercise the real loader's geometry parser and explicit visibility masks without a browser.
const bodyBytes = readFileSync("public/models/keyboard88-performer.glb");
const model = await new GLTFLoader().parseAsync(new Uint8Array(bodyBytes).buffer, "");
const manifest = JSON.parse(readFileSync("public/models/keyboard88-performer.json", "utf8")) as {
  masks: Keyboard88Masks;
};
const visibility = bindKeyboard88Visibility(model.scene, manifest.masks);
const meshes: Mesh[] = [];
model.scene.traverse((node) => {
  if (node instanceof Mesh) meshes.push(node as Mesh);
  if (node instanceof SkinnedMesh)
    assert.deepEqual(
      node.skeleton.bones.map((bone) => bone.name),
      rig.boneNames
    );
});
assert.equal(meshes.length, 3);
visibility.setVisibility({ body: false, hands: true });
assert.equal(meshes.filter((mesh) => mesh.visible).length, 2);
visibility.setVisibility({ body: true, hands: false });
assert.equal(meshes.filter((mesh) => mesh.visible).length, 1);
visibility.setVisibility({ body: false, hands: false });
assert.equal(meshes.filter((mesh) => mesh.visible).length, 0);
visibility.dispose();
disposePianistModel(model.scene);
console.log("KEYBOARD88_GLTF_VISIBILITY_PASS 52 joints / 3 roles / no nail meshes");
