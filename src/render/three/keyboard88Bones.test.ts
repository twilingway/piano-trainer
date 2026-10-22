import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { keyboard88BoneFixture } from "./keyboard88Bones.testSupport";

describe("keyboard88 exported bone fidelity", () => {
  it("skins five exported distal anchors against frozen Blender on every one of 1215 frames", () => {
    const fixture = keyboard88BoneFixture();
    const reference = readFileSync("tools/hand-rig/fixtures/keyboard88-bone-tips.bin");
    const point = new Vector3(),
      target = new Vector3();
    let maxMm = 0;
    try {
      expect(reference.byteLength).toBe(1215 * 5 * 3 * 4);
      expect(fixture.index.frames.map((f) => f.id)).toEqual(
        Array.from({ length: 1215 }, (_, i) => 308 + i)
      );
      for (let frame = 0; frame < 1215; frame++) {
        fixture.fk.set(fixture.rotations, frame * 208);
        for (let finger = 0; finger < 5; finger++) {
          const offset = (frame * 15 + finger * 3) * 4;
          target.set(
            reference.readFloatLE(offset),
            reference.readFloatLE(offset + 4),
            reference.readFloatLE(offset + 8)
          );
          fixture.mesh.getVertexPosition(finger, point).applyMatrix4(fixture.mesh.matrixWorld);
          maxMm = Math.max(maxMm, point.distanceTo(target) * 1000);
        }
      }
      expect(maxMm).toBeLessThanOrEqual(0.5);
    } finally {
      fixture.dispose();
    }
  });

  it("detects a wrong exported distal rotation", () => {
    const fixture = keyboard88BoneFixture();
    try {
      fixture.fk.set(fixture.rotations);
      const before = fixture.mesh.getVertexPosition(0, new Vector3()).clone();
      const thumb = fixture.fk.bones.find((bone) => bone.name === "m_avg_rthumb2");
      expect(thumb).toBeDefined();
      thumb?.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.5);
      fixture.fk.update();
      expect(fixture.mesh.getVertexPosition(0, new Vector3()).distanceTo(before)).toBeGreaterThan(
        0.001
      );
    } finally {
      fixture.dispose();
    }
  });
});
