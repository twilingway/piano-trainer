import { performanceRoadFlightLook } from "./performanceRoadProjection";
import { describe, it, expect } from "vitest";
import { Matrix4, Vector3 } from "three";
import { performanceNoteMatrix } from "./performanceNoteMatrix";
import { performanceRoadPoint, performanceRoadScale } from "./performanceRoadProjection";

describe("shared physical note projection", () => {
  it.each([0, 0.24, 0.9, Math.PI / 2])(
    "matches note matrices through angle %s and preserves both key anchors",
    (angle) => {
      for (const laneY of [22, 34]) {
        const scale = performanceRoadScale(5000, 60),
          matrix = new Matrix4();
        performanceNoteMatrix(matrix, 12, laneY, -1142, laneY, 142, angle, scale);
        const actual = new Vector3().applyMatrix4(matrix),
          expected = performanceRoadPoint({ x: 12, y: laneY, z: -142 }, 1000 * scale, angle);
        expect(actual.toArray()).toEqual(expect.arrayContaining([expected.x]));
        expect(actual.y).toBeCloseTo(expected.y);
        expect(actual.z).toBeCloseTo(expected.z);
        performanceNoteMatrix(matrix, 12, laneY, -142, laneY, 142, angle, scale);
        expect(new Vector3().applyMatrix4(matrix).toArray()).toEqual([12, laneY, -142]);
      }
    }
  );
  it("morphs length continuously from original road to two metres after the intro", () => {
    expect(performanceRoadScale(5000, 16)).toBe(1);
    expect(performanceRoadScale(5000, 22) * 5000).toBeCloseTo(2000);
    expect(performanceRoadScale(5000, 18)).toBe(performanceRoadScale(5000, 18));
    for (const t of [16, 22])
      expect(
        Math.abs(performanceRoadScale(5000, t + 1e-4) - performanceRoadScale(5000, t - 1e-4))
      ).toBeLessThan(1e-9);
  });
});

it("follows a rising S-curve tangent while hitting the real note plane ahead", () => {
  for (const height of [100, 140, 220])
    for (const lateral of [-80, 0, 80])
      for (const climb of [-60, 0, 60]) {
        const angle = 0.24,
          c = Math.cos(angle),
          sn = Math.sin(angle),
          position = { x: 30, y: 22 + 1400 * sn + height * c, z: -142 - 1400 * c + height * sn },
          velocity = { x: lateral, y: 400 * sn + climb * c, z: -400 * c + climb * sn },
          target = performanceRoadFlightLook(position, velocity, angle, height, 1),
          ray = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
        expect((target.y - 22) * c + (target.z + 142) * sn).toBeCloseTo(0);
        expect(
          (ray.x * velocity.x + ray.y * velocity.y + ray.z * velocity.z) /
            (Math.hypot(ray.x, ray.y, ray.z) * Math.hypot(velocity.x, velocity.y, velocity.z))
        ).toBeGreaterThan(0.9);
      }
});
