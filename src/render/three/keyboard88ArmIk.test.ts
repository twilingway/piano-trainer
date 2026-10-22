import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { Keyboard88ArmIk } from "./keyboard88ArmIk";
import type { Keyboard88ArmPose, Keyboard88ArmTarget } from "./keyboard88ArmIk";

function fixture() {
  const pose: Keyboard88ArmPose = {
    shoulder: { x: 0, y: 0, z: 0 },
    elbow: { x: 1, y: 0, z: 0 },
    wrist: { x: 1, y: 1, z: 0 },
    parentRotation: new Quaternion(),
    shoulderRotation: new Quaternion(),
    elbowRotation: new Quaternion()
  };
  const target: Keyboard88ArmTarget = {
    position: { x: 0.5, y: 1, z: 0.2 },
    pole: { x: 1, y: 0, z: 0 },
    rotation: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.8)
  };
  return { pose, target, ik: new Keyboard88ArmIk() };
}
function reconstruct(ik: Keyboard88ArmIk, parent = new Quaternion()) {
  const upper = parent.clone().multiply(new Quaternion().copy(ik.shoulder));
  const lower = upper.clone().multiply(new Quaternion().copy(ik.elbow));
  const elbow = new Vector3(1, 0, 0).applyQuaternion(upper);
  const wrist = elbow.clone().add(new Vector3(0, 1, 0).applyQuaternion(lower));
  return { elbow, wrist, rotation: lower.multiply(new Quaternion().copy(ik.wrist)) };
}
describe("keyboard88 pure arm IK", () => {
  it("converts world targets through a rotated collar parent", () => {
    const { pose, target, ik } = fixture();
    const parent = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.1);
    pose.elbow = new Vector3().copy(pose.elbow).applyQuaternion(parent);
    pose.wrist = new Vector3().copy(pose.wrist).applyQuaternion(parent);
    pose.parentRotation = parent;
    pose.shoulderRotation = parent;
    pose.elbowRotation = parent;
    target.position = new Vector3().copy(target.position).applyQuaternion(parent);
    target.pole = new Vector3().copy(target.pole).applyQuaternion(parent);
    target.rotation = parent.clone().multiply(new Quaternion().copy(target.rotation));
    expect(ik.solve(pose, target)).toBe(true);
    const solved = reconstruct(ik, parent);
    expect(solved.wrist.distanceTo(new Vector3().copy(target.position))).toBeLessThan(1e-12);
    expect(solved.rotation.angleTo(new Quaternion().copy(target.rotation))).toBeLessThan(1e-7);
  });
  it("reaches the wrist pose, keeps lengths and the atlas elbow side", () => {
    const { pose, target, ik } = fixture();
    expect(ik.solve(pose, target)).toBe(true);
    const solved = reconstruct(ik);
    expect(solved.wrist.distanceTo(new Vector3().copy(target.position))).toBeLessThan(1e-12);
    expect(solved.rotation.angleTo(new Quaternion().copy(target.rotation))).toBeLessThan(1e-7);
    expect(solved.elbow.length()).toBeCloseTo(1, 12);
    expect(solved.elbow.distanceTo(solved.wrist)).toBeCloseTo(1, 12);
    expect(solved.elbow.x).toBeGreaterThan(0.5);
    const before = JSON.stringify(pose);
    ik.solve(pose, target);
    expect(JSON.stringify(pose)).toBe(before);
  });
  it("clamps a far target to full extension without changing wrist orientation", () => {
    const { pose, target, ik } = fixture();
    target.position = { x: 0, y: 4, z: 0 };
    expect(ik.solve(pose, target)).toBe(false);
    const solved = reconstruct(ik);
    expect(solved.wrist.distanceTo(new Vector3(0, 2, 0))).toBeLessThan(1e-12);
    expect(solved.rotation.angleTo(new Quaternion().copy(target.rotation))).toBeLessThan(1e-7);
  });
  it("handles unequal lengths and clamps an inside target without stretching", () => {
    const { pose, target, ik } = fixture();
    pose.wrist = { x: 1, y: 0.5, z: 0 };
    target.position = { x: 0.1, y: 0, z: 0 };
    expect(ik.solve(pose, target)).toBe(false);
    const upper = new Quaternion().copy(ik.shoulder);
    const lower = upper.clone().multiply(new Quaternion().copy(ik.elbow));
    const elbow = new Vector3(1, 0, 0).applyQuaternion(upper);
    const wrist = elbow.clone().add(new Vector3(0, 0.5, 0).applyQuaternion(lower));
    expect(wrist.distanceTo(new Vector3(0.5, 0, 0))).toBeLessThan(1e-12);
    expect(elbow.distanceTo(wrist)).toBeCloseTo(0.5, 12);
  });
  it("handles coincident target, parallel pole and opposite aim deterministically", () => {
    const { pose, target, ik } = fixture();
    for (const position of [
      { x: 0, y: 0, z: 0 },
      { x: -2, y: 0, z: 0 }
    ]) {
      target.position = position;
      target.pole = { x: 1, y: 0, z: 0 };
      expect(ik.solve(pose, target)).toBe(true);
      expect(reconstruct(ik).wrist.distanceTo(new Vector3().copy(position))).toBeLessThan(1e-10);
      const first = { ...ik.shoulder };
      ik.solve(pose, target);
      expect(ik.shoulder).toEqual(first);
      for (const q of [ik.shoulder, ik.elbow, ik.wrist])
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
    }
  });
});
