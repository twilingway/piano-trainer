import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PerformanceCameraPath } from "./performanceCameraPath";
import type { PerformanceCameraGeometry } from "./performanceCameraPath";
import { geometry } from "./performanceCameraPath.testSupport";
import { distance, inside, point } from "./performanceCameraMath";
import { performanceShortRoute } from "./performanceShortRoute";
import { performanceSignPlacement } from "./performanceStageLayout";

const { road, ...withoutRoad } = geometry;
const SHOTS = ["front-wide", "side-hands", "notes-flight", "face", "top-hands", "final-wide"];
/** The named shots in the order they hold the frame; the rise and clearance bends join them. */
function shotOrder(path: PerformanceCameraPath): string[] {
  const shots: string[] = [];
  for (let time = path.opening; time <= path.duration; time += 0.02) {
    const shot = path.sample(time).shot;
    if (shot !== "rise" && shot !== "clearance-rise" && shots.at(-1) !== shot) shots.push(shot);
  }
  return shots;
}
function maxSpeed(path: PerformanceCameraPath): number {
  let fastest = 0;
  for (let time = path.opening + 0.001; time < path.duration - 0.001; time += 1 / 120)
    fastest = Math.max(
      fastest,
      distance(path.sample(time - 0.001).position, path.sample(time + 0.001).position) / 0.002
    );
  return fastest;
}

describe("short-song camera route", () => {
  it.each([25.7, 26, 28, 30])("plays each shot once, in order, two seconds apart: %s s", (song) => {
    const path = new PerformanceCameraPath({ ...geometry, duration: song });
    expect(path.opening).toBe(6);
    expect(path.duration).toBe(song);
    expect(shotOrder(path)).toEqual(SHOTS);
    expect(path.sample(song).shot).toBe("final-wide");
    const times = [6, ...performanceShortRoute(geometry, 6, song).map((node) => node.time)];
    for (let index = 1; index < times.length; index++)
      expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeGreaterThanOrEqual(2);
    expect(times.at(-1)).toBe(song);
  });
  it("stretches a song shorter than 25 s to a 25 s route", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 12 });
    expect(path.opening).toBe(6);
    expect(path.duration).toBe(25);
    expect(shotOrder(path)).toEqual(SHOTS);
  });
  it.each([
    ["road", geometry],
    ["no road", withoutRoad]
  ] as const)("never moves faster than the long route of the same scene: %s", (_, scene) => {
    const long = maxSpeed(new PerformanceCameraPath({ ...scene, duration: 154.5 }));
    for (const song of [25.7, 26, 28, 30])
      expect(
        maxSpeed(new PerformanceCameraPath({ ...scene, duration: song })),
        String(song)
      ).toBeLessThanOrEqual(long);
  });
  it("flies along the real tilted note road between the side and face shots", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 25.7 });
    const flight = performanceShortRoute(geometry, 6, 25.7).filter((node) => node.forwardRoad);
    expect(flight).toHaveLength(3);
    const lanes = road?.lanes.map((lane) => lane.x) ?? [];
    for (const node of flight) {
      const pose = path.sample(node.time);
      expect(pose.noteAngle).toBeCloseTo(0.24);
      expect(pose.roadScale).toBeCloseTo(2.5);
      expect(pose.crossing).toBe("through");
      expect(pose.position.x).toBeGreaterThanOrEqual(Math.min(...lanes));
      expect(pose.position.x).toBeLessThanOrEqual(Math.max(...lanes));
    }
    const [first, , last] = flight;
    expect((last?.time ?? 0) - (first?.time ?? 0)).toBeGreaterThan(4);
  });
  it("swaps the note flight for a low front pass of the hands without a road", () => {
    const path = new PerformanceCameraPath({ ...withoutRoad, duration: 26 });
    expect(shotOrder(path)).toEqual(
      SHOTS.map((shot) => (shot === "notes-flight" ? "front-low-hands" : shot))
    );
    for (let time = 6; time <= 26; time += 0.05) expect(path.sample(time).crossing).toBeUndefined();
  });
  it("never enters a mesh and detours a blocked connector", () => {
    const blocked: PerformanceCameraGeometry = {
      ...geometry,
      duration: 26,
      obstacles: [
        ...geometry.obstacles,
        { min: point(450, 400, -1600), max: point(750, 750, -1200) }
      ]
    };
    const path = new PerformanceCameraPath(blocked);
    expect(path.detours).toBeGreaterThan(0);
    for (let time = 6; time <= 26; time += 1 / 120) {
      const pose = path.sample(time);
      for (const box of blocked.obstacles)
        expect(inside(pose.position, box, path.clearance - 0.01), String(time)).toBe(false);
    }
  });
  it.each([1.6, 3440 / 1313])(
    "ends on a front view that holds the pianist and the sign at aspect %s",
    (aspect) => {
      const path = new PerformanceCameraPath({ ...geometry, duration: 26, aspect }),
        pose = path.sample(26),
        sign = performanceSignPlacement(geometry.bounds, geometry.unit);
      const camera = new PerspectiveCamera(pose.fov, aspect, 1, 50000);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.up.set(pose.up.x, pose.up.y, pose.up.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      camera.updateMatrixWorld();
      expect(pose.position.z).toBeLessThan(geometry.avatar.min.z);
      const corners: Vector3[] = [];
      for (const x of [geometry.avatar.min.x, geometry.avatar.max.x])
        for (const y of [geometry.avatar.min.y, geometry.avatar.max.y])
          for (const z of [geometry.avatar.min.z, geometry.avatar.max.z])
            corners.push(new Vector3(x, y, z));
      for (const x of [sign.base.x - sign.width / 2, sign.base.x + sign.width / 2])
        for (const y of [sign.base.y, sign.base.y + sign.maxHeight])
          corners.push(new Vector3(x, y, sign.base.z));
      const heights: number[] = [];
      for (const corner of corners) {
        const projected = corner.project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        heights.push(projected.y);
      }
      // Lifted towards the sign: the pianist's feet and the sign's top sit evenly in the frame.
      expect(Math.abs(Math.min(...heights) + Math.max(...heights))).toBeLessThan(0.2);
    }
  );
  it("repeats the same frame after pause and seek", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 26 }),
      saved = path.sample(15.3);
    path.sample(24);
    path.sample(7);
    expect(path.sample(15.3)).toEqual(saved);
    expect(path.sample(3)).toEqual(path.sample(6));
  });
});
