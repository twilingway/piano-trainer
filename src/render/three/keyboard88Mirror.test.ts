import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { Keyboard88Mirror, reflectKeyboard88Quaternion } from "./keyboard88Mirror";
import { keyboard88BoneFixture, LEFT_TIPS } from "./keyboard88Bones.testSupport";
import { keyboard88At as at } from "./keyboard88Bones";

describe("keyboard88 isolated mirror", () => {
  it("restores each own wrist after the torso mix on all frames and offset607", () => {
    const fixture = keyboard88BoneFixture();
    try {
      const { rig, rotations, fk } = fixture;
      const mirror = new Keyboard88Mirror(rig),
        output = new Float32Array(208);
      const wristIndices = ["R", "L"].map((side) => rig.boneNames.indexOf(`m_avg_${side}_Wrist`));
      const fingerIndices = rig.boneNames.flatMap((name, i) =>
        /m_avg_[lr]/.test(name) ? [i] : []
      );
      for (const offset of [0, 607])
        for (let i = 0; i < 1215; i++) {
          const right = rotations.subarray(
            ((i + offset) % 1215) * 208,
            (((i + offset) % 1215) + 1) * 208
          );
          const leftSource = rotations.subarray(i * 208, (i + 1) * 208);
          const mirrored = mirror.mirror(leftSource).slice();
          fk.set(right);
          const rightPosition = fk.head(at(wristIndices, 0));
          const rightRotation = new Quaternion().setFromRotationMatrix(
            at(fk.bones, at(wristIndices, 0)).matrixWorld
          );
          fk.set(mirrored);
          const leftPosition = fk.head(at(wristIndices, 1)).add(new Vector3(0.018, 0, 0));
          const leftRotation = new Quaternion().setFromRotationMatrix(
            at(fk.bones, at(wristIndices, 1)).matrixWorld
          );
          mirror.compose(right, leftSource, output);
          for (let side = 0; side < 2; side++) {
            const wrist = at(wristIndices, side);
            if (!(mirror.unreachableMask & (1 << side)))
              expect(
                mirror.skeleton.head(wrist).distanceTo(side === 0 ? rightPosition : leftPosition)
              ).toBeLessThan(1e-6);
            const q = new Quaternion()
              .setFromRotationMatrix(at(mirror.skeleton.bones, wrist).matrixWorld)
              .normalize();
            expect(q.angleTo((side === 0 ? rightRotation : leftRotation).normalize())).toBeLessThan(
              1e-6
            );
          }
          for (const bone of fingerIndices) {
            const own = at(rig.boneNames, bone).startsWith("m_avg_l") ? mirrored : right;
            expect(output.slice(bone * 4, bone * 4 + 4)).toEqual(own.slice(bone * 4, bone * 4 + 4));
          }
        }
    } finally {
      fixture.dispose();
    }
  });
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
