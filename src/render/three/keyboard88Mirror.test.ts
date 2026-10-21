import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { Keyboard88Mirror, reflectKeyboard88Quaternion } from "./keyboard88Mirror";
import { keyboard88BoneFixture, LEFT_TIPS } from "./keyboard88Bones.testSupport";

describe("keyboard88 isolated mirror", () => {
  it("is an involution on proper rotations", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.2);
    const twice = reflectKeyboard88Quaternion(q, new Quaternion());
    reflectKeyboard88Quaternion(twice, twice);
    expect(twice.angleTo(q)).toBeLessThan(1e-7);
  });

  it("moves only the left chain 18 mm without stretching or rotating the wrist/fingers", () => {
    const fixture = keyboard88BoneFixture();
    try {
      const mirror = new Keyboard88Mirror(fixture.rig),
        output = new Float32Array(208);
      const pose = fixture.rotations.subarray(0, 208);
      mirror.compose(pose, pose, output, { torso: false, correction: false });
      const before = LEFT_TIPS.map((i) => mirror.skeleton.tail(i));
      const lengths = mirror.skeleton.bones.map((bone) => bone.position.length());
      const pelvis = mirror.skeleton.head(0);
      expect(mirror.compose(pose, pose, output, { torso: false })).toBe(true);
      expect(mirror.skeleton.head(0).distanceTo(pelvis)).toBeLessThan(1e-7);
      expect(mirror.skeleton.bones.map((bone) => bone.position.length())).toEqual(lengths);
      for (const [i, old] of before.entries()) {
        const tip = LEFT_TIPS[i];
        if (tip === undefined) throw new Error("Missing fixture tip");
        expect(
          mirror.skeleton.tail(tip).distanceTo(old.add(new Vector3(0.018, 0, 0)))
        ).toBeLessThan(1e-6);
      }
      const repeated = output.slice();
      mirror.compose(pose, pose, output, { torso: false });
      expect(output).toEqual(repeated);
    } finally {
      fixture.dispose();
    }
  });
});
