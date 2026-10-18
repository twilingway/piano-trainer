import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { solvePianistArm } from "./pianistArmIk";

describe("pianist rigid arm IK", () => {
  it.each([-1, 1])("reaches the wrist with fixed lengths and an outward elbow (%s)", (side) => {
    const shoulder = new Vector3(side * 0.2, 0.35, 0.4);
    const wrist = new Vector3(side * 0.3, 0.04, 0.03);
    const pole = shoulder.clone().add(new Vector3(side * 0.3, -0.2, 0.3));
    const result = solvePianistArm(shoulder, wrist, 0.29, 0.25, pole);
    expect(result.elbow.distanceTo(shoulder)).toBeCloseTo(0.29, 10);
    expect(result.elbow.distanceTo(result.wrist)).toBeCloseTo(0.25, 10);
    expect(result.wrist.distanceTo(wrist)).toBeLessThan(1e-10);
    expect(result.elbow.z).toBeGreaterThan(wrist.z);
    expect(result.elbow.x * side).toBeGreaterThan(shoulder.x * side);
  });

  it("reports an unreachable target without stretching either segment", () => {
    const result = solvePianistArm(
      new Vector3(),
      new Vector3(1, 0, 0),
      0.3,
      0.2,
      new Vector3(0, 0, 1)
    );
    expect(result.elbow.length()).toBeCloseTo(0.3, 8);
    expect(result.elbow.distanceTo(result.wrist)).toBeCloseTo(0.2, 8);
    expect(result.error).toBeCloseTo(0.5, 7);
    expect(result.elbow.z).toBeGreaterThan(0);
  });

  it("stays finite at the shoulder and at a collinear pole", () => {
    for (const target of [new Vector3(), new Vector3(0, -0.3, 0)]) {
      const result = solvePianistArm(new Vector3(), target, 0.3, 0.3, new Vector3(0, -1, 0));
      expect(result.elbow.toArray().every(Number.isFinite)).toBe(true);
      expect(result.elbow.length()).toBeCloseTo(0.3, 8);
      expect(result.elbow.distanceTo(result.wrist)).toBeCloseTo(0.3, 8);
    }
  });
});
