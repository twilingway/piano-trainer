import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PerformanceCameraPath } from "./performanceCameraPath";
import type { PerformanceCameraGeometry, PerformanceCameraPose } from "./performanceCameraPath";
import { geometry } from "./performanceCameraPath.testSupport";
import { distance, inside, point } from "./performanceCameraMath";
import { PERFORMANCE_ROAD_TILT } from "./performanceRoadProjection";
import { performanceShortFraming } from "./performanceShortFraming";
import { performanceSignPlacement } from "./performanceStageLayout";

const { road: _road, ...withoutRoad } = geometry;
const sign = performanceSignPlacement(geometry.bounds);
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
  it.each([25.7, 26, 28, 30])("passes the pianist, then flies through the sign: %s s", (song) => {
    const path = new PerformanceCameraPath({ ...geometry, duration: song });
    expect(path.opening).toBe(6);
    expect(path.duration).toBe(song);
    expect(shotOrder(path)).toEqual(["pianist-pass", "sign-through"]);
  });
  it("stretches a song shorter than 25 s to a 25 s route", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 12 });
    expect(path.duration).toBe(25);
    expect(shotOrder(path)).toEqual(["pianist-pass", "sign-through"]);
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
  it("tilts the note road gently towards the camera and never flies into it", () => {
    const path = new PerformanceCameraPath({ ...geometry, duration: 25.7 });
    for (let time = 6; time <= 25.7; time += 0.05) {
      const pose = path.sample(time);
      if (time >= 9) expect(pose.noteAngle, String(time)).toBeCloseTo(PERFORMANCE_ROAD_TILT);
      expect(pose.crossing, String(time)).toBeUndefined();
      expect(pose.roadScale, String(time)).toBe(1);
    }
  });
  it.each([1.6, 16 / 9, 3440 / 1313])(
    "moves left to right with the hands, the head and the notes below and the whole sign on top at aspect %s",
    (aspect) => {
      const path = new PerformanceCameraPath({ ...geometry, duration: 25.7, aspect });
      const pianist = [
        new Vector3(geometry.keyboard.x, geometry.keyboard.y, geometry.keyboard.z),
        new Vector3(0, geometry.avatar.max.y, (geometry.avatar.min.z + geometry.avatar.max.z) / 2),
        // The note road just in front of the keyboard.
        new Vector3(geometry.keyboard.x, geometry.keyboard.y, geometry.keyboard.z - 300)
      ];
      let x = -Infinity;
      for (let time = 9; time <= 21.7; time += 0.1) {
        const pose = path.sample(time);
        expect(pose.shot).toBe("pianist-pass");
        expect(pose.position.x, String(time)).toBeGreaterThan(x);
        x = pose.position.x;
        for (const p of project(pose, aspect, pianist)) {
          expect(Math.abs(p.x), String(time)).toBeLessThan(1);
          expect(p.y, String(time)).toBeGreaterThan(-1);
          expect(p.y, String(time)).toBeLessThan(0.3);
        }
        for (const corner of project(pose, aspect, signCorners)) {
          expect(Math.abs(corner.x), String(time)).toBeLessThan(1);
          expect(corner.y, String(time)).toBeGreaterThan(0.3);
          expect(corner.y, String(time)).toBeLessThan(1);
        }
      }
      // Seen square on, the sign spans most of a 1.6 frame's width.
      const middle = project(path.sample(15.35), aspect, signCorners).map((corner) => corner.x);
      expect(Math.max(...middle) - Math.min(...middle)).toBeGreaterThan(aspect < 2 ? 1.2 : 0.9);
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
    const middle = performanceShortFraming(geometry.bounds).camera;
    const blocked: PerformanceCameraGeometry = {
      ...geometry,
      duration: 26,
      obstacles: [
        ...geometry.obstacles,
        {
          min: point(-200, middle.y - 200, middle.z - 200),
          max: point(200, middle.y + 200, middle.z + 200)
        }
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
