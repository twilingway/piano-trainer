import { describe, expect, it } from "vitest";
import { performanceCameraClipping } from "./performanceCameraClipping";
import { point } from "./performanceCameraMath";
describe("FPV depth precision", () => {
  it("uses millimetre-scale near rather than 0.1 and no arbitrary 100000 far minimum", () => {
    const bounds = { min: point(-1000, -500, -200), max: point(1000, 1500, 700) };
    const clip = performanceCameraClipping(point(0, 500, -2000), bounds, 1500, 1);
    expect(clip.near).toBe(7.5);
    expect(clip.far).toBeLessThan(10_000);
    expect(clip.far).toBeGreaterThan(3500);
  });
  it("keeps both horizontal and vertical far note endpoints inside the far plane", () => {
    const camera = point(500, 1000, 1500);
    const bounds = { min: point(-500, -500, -142), max: point(500, 1200, 700) };
    const road = { lanes: [point(-330, 22, -142), point(330, 34, -142)], height: 1900 };
    const clip = performanceCameraClipping(camera, bounds, 1200, 1, road);
    for (const lane of road.lanes)
      for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
        const end = point(
          lane.x,
          lane.y + road.height * Math.sin(angle),
          lane.z - road.height * Math.cos(angle)
        );
        expect(Math.hypot(camera.x - end.x, camera.y - end.y, camera.z - end.z)).toBeLessThan(
          clip.far
        );
      }
    expect(clip.far).toBeLessThan(10_000);
  });
});
