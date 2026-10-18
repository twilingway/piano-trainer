import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PerformanceCameraPath } from "./performanceCameraPath";
import type { PerformanceCameraGeometry, PerformanceCameraPose } from "./performanceCameraPath";
import { geometry } from "./performanceCameraPath.testSupport";
import { distance, inside, point } from "./performanceCameraMath";
import { performanceSignPlacement } from "./performanceStageLayout";

const { road: _road, ...withoutRoad } = geometry;
const sign = performanceSignPlacement(geometry.bounds, geometry.unit);
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
/** Normalised device coordinates of world points seen from a sampled pose. */
function project(pose: PerformanceCameraPose, aspect: number, points: readonly Vector3[]) {
  const camera = new PerspectiveCamera(pose.fov, aspect, 1, 50000);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.up.set(pose.up.x, pose.up.y, pose.up.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateMatrixWorld();
  return points.map((p) => p.clone().project(camera));
}
const signCorners = [-1, 1].flatMap((side) =>
  [0, sign.maxHeight].map(
    (height) =>
      new Vector3(sign.base.x + (side * sign.width) / 2, sign.base.y + height, sign.base.z)
  )
);

describe("short-song camera route", () => {
  it.each([25.7, 26, 28, 30])("passes the sign, then flies through it: %s s", (song) => {
    const path = new PerformanceCameraPath({ ...geometry, duration: song });
    expect(path.opening).toBe(6);
    expect(path.duration).toBe(song);
    expect(shotOrder(path)).toEqual(["sign-pass", "sign-through"]);
  });
  it("stretches a song shorter than 25 s to a 25 s route", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 12 });
    expect(path.duration).toBe(25);
    expect(shotOrder(path)).toEqual(["sign-pass", "sign-through"]);
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
  it("keeps the note road flat and never flies into it", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 25.7 });
    for (let time = 6; time <= 25.7; time += 0.05) {
      const pose = path.sample(time);
      expect(pose.noteAngle, String(time)).toBe(0);
      expect(pose.crossing, String(time)).toBeUndefined();
      expect(pose.roadScale, String(time)).toBe(1);
    }
  });
  it.each([1.6, 3440 / 1313, 0.56])(
    "moves left to right holding the whole sign large above the pianist's head at aspect %s",
    (aspect) => {
      const path = new PerformanceCameraPath({ ...geometry, duration: 25.7, aspect });
      const head = new Vector3(
        (geometry.avatar.min.x + geometry.avatar.max.x) / 2,
        geometry.avatar.max.y - 100,
        (geometry.avatar.min.z + geometry.avatar.max.z) / 2
      );
      let x = -Infinity;
      for (let time = 9; time <= 21.7; time += 0.1) {
        const pose = path.sample(time);
        expect(pose.shot).toBe("sign-pass");
        expect(pose.position.x, String(time)).toBeGreaterThan(x);
        x = pose.position.x;
        const [first, ...rest] = project(pose, aspect, [head, ...signCorners]);
        for (const corner of [first, ...rest]) {
          expect(Math.abs(corner?.x ?? 2), String(time)).toBeLessThan(1);
          expect(Math.abs(corner?.y ?? 2), String(time)).toBeLessThan(1);
        }
      }
      // Seen square on, the sign spans more than half the frame's width.
      const middle = project(path.sample(15.35), aspect, signCorners).map((corner) => corner.x);
      expect(Math.max(...middle) - Math.min(...middle)).toBeGreaterThan(1);
    }
  );
  it("flies straight through the sign's plane at the end and is still moving", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 25.7 });
    let crossings = 0,
      front = true;
    for (let time = 6; time <= 25.7; time += 1 / 120) {
      const pose = path.sample(time),
        before = pose.position.z < sign.base.z;
      if (before !== front) crossings++;
      front = before;
      if (!before) {
        expect(pose.shot).toBe("sign-through");
        expect(pose.position.x).toBeGreaterThan(sign.base.x - sign.width / 2);
        expect(pose.position.x).toBeLessThan(sign.base.x + sign.width / 2);
        expect(pose.position.y).toBeGreaterThan(sign.base.y);
        expect(pose.position.y).toBeLessThan(sign.base.y + sign.maxHeight);
      }
    }
    expect(crossings).toBe(1);
    expect(path.sample(25.7).position.z).toBeGreaterThan(sign.base.z);
    expect(path.sample(24).position.z).toBeLessThan(sign.base.z);
    expect(
      distance(path.sample(25.69).position, path.sample(25.7).position) / 0.01
    ).toBeGreaterThan(100);
  });
  it("never enters a mesh and detours a blocked connector", () => {
    const blocked: PerformanceCameraGeometry = {
      ...geometry,
      duration: 26,
      obstacles: [
        ...geometry.obstacles,
        { min: point(-400, 1400, -1200), max: point(400, 1800, -800) }
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
  it("repeats the same frame after pause and seek", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 26 }),
      saved = path.sample(15.3);
    path.sample(24);
    path.sample(7);
    expect(path.sample(15.3)).toEqual(saved);
    expect(path.sample(3)).toEqual(path.sample(6));
  });
});
