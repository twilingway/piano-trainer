import { createHash } from "node:crypto";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { PerformanceCameraPath } from "./performanceCameraPath";
import { geometry } from "./performanceCameraPath.testSupport";
import { performanceOpeningPosition } from "./performanceCameraGeometry";
import { point } from "./performanceCameraMath";
import { performanceRoadScale } from "./performanceRoadProjection";
import { PerformanceScene } from "./PerformanceScene";
import { performanceSceneTimeline } from "./performanceSceneTimeline";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import type { KeyBox } from "./keyBoxes";

/** Full-precision JSON, so any changed bit of a long song's staging changes the digest. */
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const times = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) => from + index * step);
const key: KeyBox = {
  pitch: 60,
  black: false,
  x: 0,
  width: 22,
  bottom: 0,
  top: 22,
  front: 0,
  back: 142,
  uv: { u0: 0, u1: 1, v0: 0, v1: 1 }
};

// Digests were taken from the route before short songs got their own staging.
describe("long-song staging stays bit-identical", () => {
  it.each([
    ["default length", {}, "9e0f8add8bc3e19c81e2b988c117e4b3337b2ae2eadf5a98ad4912699e229877"],
    [
      "154.5 s",
      { duration: 154.5 },
      "9e0f8add8bc3e19c81e2b988c117e4b3337b2ae2eadf5a98ad4912699e229877"
    ],
    [
      "90 s, wide",
      { duration: 90, aspect: 3440 / 1313 },
      "bb335544c5438ee16625f2de287e9f50a93c39beb205c4eef6f17d0cabee5dca"
    ],
    [
      "no road",
      { duration: 154.5 },
      "58d481b30910c69acbb16d31a31dc808db37b48ea906b9d73ceb7daaf0c679a8"
    ]
  ] as const)("samples the camera route: %s", (name, change, expected) => {
    const { road, ...withoutRoad } = geometry;
    const path = new PerformanceCameraPath({
      ...(name === "no road" ? withoutRoad : { ...withoutRoad, ...(road ? { road } : {}) }),
      ...change
    });
    expect(digest(times(0, 160, 0.05).map((time) => path.sample(time)))).toBe(expected);
  });
  it("keeps the opening clock, reveal path and road scale", () => {
    const close = point(-100, 400, 31);
    expect(
      digest(
        times(0, 40, 0.01).map((time) => [
          performanceSceneTimeline(time),
          performanceOpeningPosition(time, close, geometry),
          performanceRoadScale(5000, time)
        ])
      )
    ).toBe("366a472a1a4e9bab13124fb680bc9cc9d7cda460bda30209ab946ef712960290");
  });
  it("keeps the composed camera and lights of a 154.5 s song", () => {
    const scene = new Scene(),
      subject = new Group(),
      box = new BoxGeometry(1300, 22, 142),
      material = new MeshBasicMaterial();
    subject.add(new Mesh(box, material));
    scene.add(subject);
    const performance = new PerformanceScene(scene);
    performance.layout([key]);
    performance.setNotes({ left: [{ start: 0, duration: 154.5, pitch: 60 }], right: [] });
    performance.setRoad(new ThreeRoadFrame(), key.top, 142, 5142);
    const frames = times(0, 160, 0.1).map((time) => {
      const angle = performance.update(time, 1600, 1000, subject);
      return [
        angle,
        performance.roadScale,
        performance.camera.position.toArray(),
        performance.camera.quaternion.toArray(),
        performance.camera.fov,
        performance.lights.group.children.map((child) =>
          "intensity" in child ? child.intensity : child.visible
        )
      ];
    });
    expect(digest(frames)).toBe("87b6a57c8fbfcf772226e2cbdedc01967f36e2025446a7f1de9345e4eda3c1a0");
    performance.dispose();
    box.dispose();
    material.dispose();
  });
});
