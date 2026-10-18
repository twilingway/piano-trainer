import { Bone, Euler, Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { BoneFrame } from "./handPose";
import { performerMotion } from "./performerMotion";
import { NativePerformerMotion } from "./NativePerformerMotion";

const beats = Array.from({ length: 17 }, (_, position) => ({
  time: position * 0.5,
  position,
  downbeat: position % 4 === 0
}));
function fixture(aliases = false) {
  const stage = new Group(),
    scene = new Group(),
    torso = new Bone(),
    head = new Bone(),
    foot = new Bone(),
    right = new Bone(),
    wrist = new Bone(),
    toe = new Group();
  stage.add(scene);
  stage.scale.set(1000, 1000, 1250);
  stage.rotation.y = 0.4;
  torso.name = "spine";
  head.name = aliases ? "Head" : "head";
  foot.name = aliases ? "footL" : "foot.L";
  right.name = "foot.R";
  torso.add(head, wrist);
  scene.add(torso, foot, right);
  torso.position.y = 0.9;
  head.position.set(0, 0.7, 0.1);
  foot.position.set(-0.1, 0.1, 0.15);
  right.position.set(0.1, 0.1, 0.15);
  head.rotation.set(0.22, -0.11, 0.05);
  foot.rotation.set(0.3, 0.4, -0.2);
  right.rotation.x = -0.08;
  scene.updateWorldMatrix(true, true);
  // Toe starts along model -Z despite the imported foot's arbitrary local bone axes.
  toe.position.copy(new Vector3(0, 0, -0.2).applyQuaternion(foot.quaternion.clone().invert()));
  foot.add(toe);
  const before = [torso, head, foot, right, wrist].map((bone) => ({
    bone,
    position: bone.position.clone(),
    scale: bone.scale.clone(),
    parent: bone.parent,
    rotation: bone.quaternion.clone()
  }));
  return {
    stage,
    scene,
    torso,
    head,
    foot,
    right,
    wrist,
    toe,
    before,
    motion: new NativePerformerMotion(scene),
    frame: new BoneFrame(scene)
  };
}

describe("native original-skeleton musical accents", () => {
  it.each([false, true])(
    "adds bounded head motion in the common frame and leaves body, hands and right pedal untouched (aliases %s)",
    (aliases) => {
      const f = fixture(aliases),
        time = 1.91,
        expected = performerMotion(time, beats);
      const headBase = f.frame.turn(f.head),
        footBase = f.frame.turn(f.foot);
      const inverse = f.scene.matrixWorld.clone().invert();
      const toeBefore = f.toe.getWorldPosition(new Vector3()).applyMatrix4(inverse);
      f.motion.apply(time, beats);
      const headExpected = new Quaternion()
        .setFromEuler(new Euler(0, expected.headYaw, expected.headRoll))
        .multiply(headBase);
      const footExpected = new Quaternion()
        .setFromAxisAngle(new Vector3(1, 0, 0), expected.leftFootPitch)
        .multiply(footBase);
      expect(f.frame.turn(f.head).angleTo(headExpected)).toBeLessThan(1e-7);
      expect(f.frame.turn(f.foot).angleTo(footExpected)).toBeLessThan(1e-7);
      const toeAfter = f.toe.getWorldPosition(new Vector3()).applyMatrix4(inverse);
      expect(toeAfter.y - toeBefore.y).toBeGreaterThan(0.03);
      for (const original of f.before) {
        expect(original.bone.position.equals(original.position)).toBe(true);
        expect(original.bone.scale.equals(original.scale)).toBe(true);
        expect(original.bone.parent).toBe(original.parent);
        if (![f.head, f.foot].includes(original.bone))
          expect(original.bone.quaternion.equals(original.rotation)).toBe(true);
      }
      expect(f.head.quaternion.angleTo(f.before[1]?.rotation ?? new Quaternion())).toBeLessThan(
        (3.3 * Math.PI) / 180
      );
      expect(f.foot.quaternion.angleTo(f.before[2]?.rotation ?? new Quaternion())).toBeCloseTo(
        (12 * Math.PI) / 180,
        8
      );
    }
  );
  it("does not accumulate paused samples or seek history, and restores the exact source base", () => {
    const f = fixture();
    f.motion.apply(1.91, beats);
    const head = f.head.quaternion.clone(),
      foot = f.foot.quaternion.clone();
    for (let i = 0; i < 100; i++) f.motion.apply(1.91, beats);
    expect(f.head.quaternion.angleTo(head)).toBeLessThan(1e-7);
    expect(f.foot.quaternion.angleTo(foot)).toBeLessThan(1e-7);
    f.motion.apply(5.41, beats);
    f.motion.apply(1.91, beats);
    expect(f.head.quaternion.angleTo(head)).toBeLessThan(1e-7);
    expect(f.foot.quaternion.angleTo(foot)).toBeLessThan(1e-7);
    f.motion.prepare();
    for (const original of f.before)
      expect(original.bone.quaternion.equals(original.rotation)).toBe(true);
    f.motion.dispose();
    f.motion.dispose();
    f.motion.apply(1.91, beats);
    for (const original of f.before)
      expect(original.bone.quaternion.equals(original.rotation)).toBe(true);
  });
  it("accepts a fresh animated quaternion and a pre-sample restore on untracked bones", () => {
    const f = fixture();
    f.motion.apply(1.91, beats);
    f.motion.prepare();
    const fresh = new Quaternion().setFromEuler(new Euler(-0.3, 0.1, -0.2));
    f.head.quaternion.copy(fresh);
    f.motion.apply(2.5, beats);
    f.motion.prepare();
    expect(f.head.quaternion.equals(fresh)).toBe(true);
    f.motion.apply(1.91, beats);
    f.head.quaternion.copy(fresh);
    f.motion.prepare();
    expect(f.head.quaternion.equals(fresh)).toBe(true);
    f.motion.apply(1.91, []);
    expect(f.head.quaternion.angleTo(fresh)).toBeLessThan(1e-7);
  });
  it("is safe for unknown skeletons and neutral without a score beat grid", () => {
    const empty = new NativePerformerMotion(new Group());
    expect(() => {
      empty.prepare();
      empty.apply(1.91, beats);
      empty.dispose();
    }).not.toThrow();
    const f = fixture();
    f.motion.apply(1.91, []);
    for (const original of f.before)
      expect(original.bone.quaternion.angleTo(original.rotation)).toBeLessThan(1e-7);
  });
});
