import { inside, point, segmentBlocked } from "./performanceCameraMath";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import type { PointLight } from "three";
import { describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SpotLight,
  Vector3
} from "three";
import { performanceSignPlacement } from "./performanceStageLayout";
import { PerformanceScene } from "./PerformanceScene";
import type { KeyBox } from "./keyBoxes";

const key: KeyBox = {
  pitch: 60,
  black: false,
  x: 480,
  width: 22,
  bottom: 0,
  top: 22,
  front: 0,
  back: 142,
  uv: { u0: 0, u1: 1, v0: 0, v1: 1 }
};
describe("performance camera", () => {
  it("lights inspection at opening and song end without moving either camera or routing notes", () => {
    const scene = new Scene();
    const subject = new Group();
    const geometry = new BoxGeometry(600, 800, 400);
    const material = new MeshBasicMaterial();
    subject.add(new Mesh(geometry, material));
    scene.add(subject);
    const performance = new PerformanceScene(scene);
    const manual = new PerspectiveCamera(45, 1.5, 1, 10000);
    manual.position.set(400, 1000, 2000);
    manual.lookAt(0, 0, 0);
    manual.updateMatrixWorld();
    performance.layout([key]);
    performance.setNotes({ left: [{ start: 0, duration: 30, pitch: 60 }], right: [] });
    const manualPosition = manual.position.clone();
    const manualRotation = manual.quaternion.clone();
    const automaticPosition = performance.camera.position.clone();
    const automaticRotation = performance.camera.quaternion.clone();
    const spots = performance.lights.group.children.filter(
      (child): child is SpotLight => child instanceof SpotLight
    );
    for (const time of [0, 30, 30, 0]) {
      performance.updateInspection(time, subject, manual);
      expect(spots.map((spot) => spot.intensity)).toEqual([0.85, 1.05]);
      expect(manual.position.equals(manualPosition)).toBe(true);
      expect(manual.quaternion.equals(manualRotation)).toBe(true);
      expect(performance.camera.position.equals(automaticPosition)).toBe(true);
      expect(performance.camera.quaternion.equals(automaticRotation)).toBe(true);
      expect(performance.roadScale).toBe(1);
    }
    performance.update(0, 1200, 800, subject);
    expect(spots.map((spot) => spot.intensity)).toEqual([0, 0]);
    performance.dispose();
    geometry.dispose();
    material.dispose();
  });

  it("restores the same pose after pause and backwards seek", () => {
    const scene = new Scene();
    const subject = new Group();
    const geometry = new BoxGeometry(600, 800, 400);
    const material = new MeshBasicMaterial();
    subject.add(new Mesh(geometry, material));
    scene.add(subject);
    const performance = new PerformanceScene(scene);
    performance.layout([key]);
    performance.update(25, 1200, 800, subject);
    const position = performance.camera.position.clone();
    const rotation = performance.camera.quaternion.clone();
    performance.update(90, 1200, 800, subject);
    performance.update(25, 1200, 800, subject);
    expect(performance.camera.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(performance.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
    performance.update(0, 1200, 800, subject);
    const start = performance.camera.position.clone();
    expect(start.x).toBe(key.x);
    performance.update(10, 1200, 800, subject);
    expect(performance.camera.position.distanceTo(start)).toBe(0);
    performance.dispose();
    geometry.dispose();
    material.dispose();
  });
  it("keeps stage spotlights off through twelve seconds and reproduces their fade after seek", () => {
    const scene = new Scene();
    const subject = new Group();
    const performance = new PerformanceScene(scene);
    const spots = performance.lights.group.children.filter(
      (child): child is SpotLight => child instanceof SpotLight
    );
    performance.update(10, 1200, 800, subject);
    expect(spots.map((spot) => spot.intensity)).toEqual([0, 0]);
    performance.update(12, 1200, 800, subject);
    expect(spots.map((spot) => spot.intensity)).toEqual([0, 0]);
    performance.update(14, 1200, 800, subject);
    const half = spots.map((spot) => spot.intensity);
    expect(half).toEqual([0.425, 0.525]);
    performance.update(10, 1200, 800, subject);
    performance.update(14, 1200, 800, subject);
    expect(spots.map((spot) => spot.intensity)).toEqual(half);
    performance.dispose();
  });
});

it("centres the intro on the opening notes and keeps the hand fill local", () => {
  const scene = new Scene(),
    subject = new Group();
  const performance = new PerformanceScene(scene);
  const leftKey = { ...key, pitch: 40, x: -330 };
  performance.layout([leftKey, key]);
  performance.setNotes({ left: [{ start: 0, duration: 1, pitch: 40 }], right: [] });
  performance.update(0, 1200, 800, subject);
  expect(performance.camera.position.x).toBe(-330);
  const fill = performance.lights.group.children.find(
    (child) => child.type === "PointLight"
  ) as PointLight;
  expect(fill.distance).toBeGreaterThan(0);
  expect(fill.distance).toBeLessThanOrEqual(260);
  expect(fill.position.y - key.top).toBeLessThan(100);
  performance.dispose();
});

it("centres a short song's intro only on the notes under its sub-second hands shot", () => {
  const performance = new PerformanceScene(new Scene()),
    subject = new Group();
  performance.layout([{ ...key, pitch: 40, x: -330 }, key]);
  performance.setNotes({
    left: [{ start: 0, duration: 25, pitch: 40 }],
    right: [{ start: 2, duration: 1, pitch: 60 }]
  });
  performance.update(0, 1200, 800, subject);
  expect(performance.camera.position.x).toBe(-330);
  performance.dispose();
});

it.each([
  [1600, 1000],
  [1689, 1285],
  [390, 844]
])("keeps complete palms and the keyboard in the opening %sx%s frame", (width, height) => {
  const scene = new Scene(),
    subject = new Group();
  const performance = new PerformanceScene(scene);
  performance.layout([key]);
  performance.update(0, width, height, subject);
  for (const x of [key.x - key.width * 8, key.x + key.width * 8]) {
    for (const z of [-142, 180]) {
      const corner = new Vector3(x, key.top, z).project(performance.camera);
      expect(Math.abs(corner.x)).toBeLessThan(0.95);
      expect(Math.abs(corner.y)).toBeLessThan(0.95);
    }
  }
  performance.dispose();
});

it("restores the unchanged opening after a flight with a different FOV", () => {
  const performance = new PerformanceScene(new Scene()),
    subject = new Group();
  performance.layout([key]);
  performance.update(0, 1689, 1285, subject);
  const initial = performance.camera.position.clone(),
    rotation = performance.camera.quaternion.clone();
  performance.update(75, 1689, 1285, subject);
  expect(performance.camera.fov).not.toBe(45);
  performance.update(0, 1689, 1285, subject);
  expect(performance.camera.position.distanceTo(initial)).toBeLessThan(1e-9);
  expect(performance.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
  expect(performance.camera.fov).toBe(45);
  performance.dispose();
});

it("ignores visible-note births/deaths and keeps the keyboard composition continuous", () => {
  const performance = new PerformanceScene(new Scene()),
    subject = new Group(),
    frame = new ThreeRoadFrame();
  performance.layout([key]);
  performance.setNotes({ left: [{ start: 0, duration: 154.5, pitch: 60 }], right: [] });
  performance.setRoad(frame, key.top, 142, 5142);
  performance.update(50, 3440, 1313, subject);
  const initial = performance.camera.quaternion.clone(),
    position = performance.camera.position.clone();
  for (const [x, count] of [
    [-500, 1],
    [700, 1],
    [0, 0],
    [50, 1]
  ] as const) {
    frame.notes[0] = { x, top: 1700, bottom: 1300, width: 20, alpha: 1, color: 0xff0000 };
    frame.noteCount = count;
    performance.setRoad(frame, key.top, 142, 5142);
    performance.update(50, 3440, 1313, subject);
    expect(performance.camera.quaternion.angleTo(initial)).toBeLessThan(1e-6);
    expect(performance.camera.position.distanceTo(position)).toBeLessThan(1e-9);
  }
  const normal = new Vector3(0, Math.cos(0.24), Math.sin(0.24)),
    anchor = new Vector3(key.x, key.top, -142),
    ray = performance.camera.getWorldDirection(new Vector3());
  const distance = anchor.clone().sub(performance.camera.position).dot(normal) / ray.dot(normal),
    visible = performance.camera.position
      .clone()
      .addScaledVector(ray, distance)
      .project(performance.camera);
  expect(distance).toBeGreaterThan(100);
  expect(distance).toBeLessThan(1400);
  expect(Math.abs(visible.x)).toBeLessThan(0.001);
  expect(Math.abs(visible.y)).toBeLessThan(0.001);
  performance.dispose();
});
it("bounds actual camera angular velocity with changing road frames across the whole melody", () => {
  const performance = new PerformanceScene(new Scene()),
    subject = new Group(),
    frame = new ThreeRoadFrame();
  performance.layout([key]);
  performance.setNotes({ left: [{ start: 0, duration: 154.5, pitch: 60 }], right: [] });
  performance.setRoad(frame, key.top, 142, 5142);
  performance.update(16, 3440, 1313, subject);
  const previous = performance.camera.quaternion.clone();
  let maximum = 0,
    maximumTime = 0;
  for (let time = 16 + 1 / 120; time <= 154.5; time += 1 / 120) {
    frame.noteCount = Math.floor(time * 7) % 2;
    frame.notes[0] = {
      x: Math.sin(time * 13) * 600,
      top: 1700,
      bottom: 1300,
      width: 20,
      alpha: 1,
      color: 0xff0000
    };
    performance.setRoad(frame, key.top, 142, 5142);
    performance.update(time, 3440, 1313, subject);
    const velocity = previous.angleTo(performance.camera.quaternion) * 120;
    if (velocity > maximum) {
      maximum = velocity;
      maximumTime = time;
    }
    previous.copy(performance.camera.quaternion);
  }
  expect(maximum, String(maximumTime)).toBeLessThan(3);
  performance.dispose();
});

it("uses the true last note end for light fade without changing session time", () => {
  const performance = new PerformanceScene(new Scene()),
    subject = new Group();
  performance.layout([key]);
  performance.setNotes({ left: [{ start: 150, duration: 4.5, pitch: 60 }], right: [] });
  expect(performance.getDuration()).toBe(154.5);
  performance.update(154.5, 1600, 1000, subject);
  const spots = performance.lights.group.children.filter(
    (c): c is SpotLight => c instanceof SpotLight
  );
  expect(spots.every((l) => l.intensity === 0)).toBe(true);
  performance.update(20, 1600, 1000, subject);
  expect(spots.map((l) => l.intensity)).toEqual([0.85, 1.05]);
  performance.dispose();
});

it("preserves the original player-side opening and joins frame16 without a roll or position jump", () => {
  const scene = new Scene(),
    subject = new Group(),
    material = new MeshBasicMaterial();
  const base = new BoxGeometry(1300, 22, 142),
    hatGeometry = new BoxGeometry(400, 260, 450);
  const board = new Mesh(base, material),
    hat = new Mesh(hatGeometry, material);
  board.position.set(0, 11, -71);
  hat.position.set(0, 1000, 125);
  subject.add(board, hat);
  scene.add(subject);
  const performance = new PerformanceScene(scene);
  performance.layout([{ ...key, x: 0 }]);
  const box = { min: point(-200, 870, -100), max: point(200, 1130, 350) };
  let priorRotation = performance.camera.quaternion.clone(),
    priorPosition = performance.camera.position.clone();
  for (let time = 0; time <= 22; time += 0.02) {
    performance.update(time, 1600, 1000, subject);
    if (time > 0) {
      expect(
        priorRotation.angleTo(performance.camera.quaternion) / 0.02,
        String(time)
      ).toBeLessThan(3);
      expect(priorPosition.distanceTo(performance.camera.position), String(time)).toBeLessThan(72);
    }
    priorRotation = performance.camera.quaternion.clone();
    priorPosition = performance.camera.position.clone();
    if (time <= 16) {
      expect(inside(performance.camera.position, box, 12), String(time)).toBe(false);
      expect(performance.camera.getWorldDirection(new Vector3()).z).toBeLessThanOrEqual(0);
      expect(new Vector3(1, 0, 0).applyQuaternion(performance.camera.quaternion).x).toBeGreaterThan(
        0
      );
      expect(performance.camera.up.toArray()).toEqual([0, 0, -1]);
      const front = new Vector3(0, 22, 0).project(performance.camera);
      const rear = new Vector3(0, 22, -100).project(performance.camera);
      expect(rear.y).toBeGreaterThan(front.y);
    }
    if (time <= 10) {
      const openingHeight = 22 + (360 / (2 * Math.tan(Math.PI / 8))) * 1.1;
      expect(performance.camera.position.toArray()).toEqual([0, openingHeight, 31]);
      for (const x of [-176, 176])
        for (const z of [-142, 180]) {
          const projected = new Vector3(x, 22, z).project(performance.camera);
          expect(Math.abs(projected.x)).toBeLessThan(0.95);
          expect(Math.abs(projected.y)).toBeLessThan(0.95);
        }
      for (const target of [point(0, 22, 30), point(0, 92, 180)])
        expect(segmentBlocked(performance.camera.position, target, box, 0), String(time)).toBe(
          false
        );
    }
  }
  for (const time of [84, 86, 88, 90, 92, 94]) {
    performance.update(time, 1600, 1000, subject);
    expect(performance.camera.getWorldDirection(new Vector3()).z, String(time)).toBeLessThanOrEqual(
      0
    );
    const front = new Vector3(0, 22, 0).project(performance.camera);
    const rear = new Vector3(0, 22, -100).project(performance.camera);
    expect(rear.y, String(time)).toBeGreaterThan(front.y);
  }
  performance.update(16 - 0.0001, 1600, 1000, subject);
  const before = performance.camera.quaternion.clone(),
    position = performance.camera.position.clone();
  performance.update(16 + 0.0001, 1600, 1000, subject);
  expect(before.angleTo(performance.camera.quaternion)).toBeLessThan(0.0001);
  expect(position.distanceTo(performance.camera.position)).toBeLessThan(0.001);
  performance.dispose();
  base.dispose();
  hatGeometry.dispose();
  material.dispose();
});

it("plays a short song's compressed opening into its route no faster than a long song", () => {
  const material = new MeshBasicMaterial(),
    base = new BoxGeometry(1300, 22, 142),
    hatGeometry = new BoxGeometry(400, 260, 450);
  const run = (duration: number) => {
    const scene = new Scene(),
      subject = new Group(),
      board = new Mesh(base, material),
      hat = new Mesh(hatGeometry, material);
    board.position.set(0, 11, -71);
    hat.position.set(0, 1000, 125);
    subject.add(board, hat);
    scene.add(subject);
    const performance = new PerformanceScene(scene);
    performance.layout([{ ...key, x: 0 }]);
    performance.setNotes({ left: [{ start: 0, duration, pitch: 60 }], right: [] });
    const spots = performance.lights.group.children.filter(
      (child): child is SpotLight => child instanceof SpotLight
    );
    performance.update(0, 1600, 1000, subject);
    let position = performance.camera.position.clone(),
      rotation = performance.camera.quaternion.clone(),
      speed = 0,
      turn = 0;
    const lights = new Map<number, number[]>();
    for (let time = 1 / 120; time <= Math.min(duration, 154.5); time += 1 / 120) {
      performance.update(time, 1600, 1000, subject);
      speed = Math.max(speed, position.distanceTo(performance.camera.position) * 120);
      turn = Math.max(turn, rotation.angleTo(performance.camera.quaternion) * 120);
      position = performance.camera.position.clone();
      rotation = performance.camera.quaternion.clone();
    }
    for (const time of [0.9, 2.6, 6]) {
      performance.update(time, 1600, 1000, subject);
      lights.set(
        time,
        spots.map((spot) => spot.intensity)
      );
    }
    performance.update(6 - 0.0001, 1600, 1000, subject);
    const before = performance.camera.position.clone(),
      fov = performance.camera.fov;
    performance.update(6 + 0.0001, 1600, 1000, subject);
    const joint = before.distanceTo(performance.camera.position);
    performance.dispose();
    return { speed, turn, lights, joint, fov };
  };
  const long = run(154.5),
    short = run(25.7);
  expect(short.speed).toBeLessThanOrEqual(long.speed);
  expect(short.turn).toBeLessThan(3);
  expect(short.lights.get(0.9)).toEqual([0, 0]);
  expect(short.lights.get(2.6)).toEqual([0, 0]);
  expect(short.lights.get(6)).toEqual([0.85, 1.05]);
  expect(long.lights.get(6)).toEqual([0, 0]);
  expect(short.fov).toBe(45);
  expect(short.joint).toBeLessThan(0.01);
  base.dispose();
  hatGeometry.dispose();
  material.dispose();
});

it("reaches a short song's far backdrop sign with the far plane", () => {
  const material = new MeshBasicMaterial(),
    box = new BoxGeometry(1300, 1800, 900),
    scene = new Scene(),
    subject = new Group();
  const mesh = new Mesh(box, material);
  mesh.position.set(0, 900, 250);
  subject.add(mesh);
  scene.add(subject);
  const performance = new PerformanceScene(scene);
  performance.layout([{ ...key, x: 0 }]);
  performance.setNotes({ left: [{ start: 0, duration: 25.7, pitch: 60 }], right: [] });
  performance.update(15, 1600, 1000, subject);
  subject.updateMatrixWorld(true);
  const sign = performanceSignPlacement(new Box3().setFromObject(subject));
  const far = new Vector3(sign.base.x + sign.width / 2, sign.base.y + sign.maxHeight, sign.base.z);
  expect(performance.camera.far).toBeGreaterThan(far.distanceTo(performance.camera.position));
  performance.dispose();
  box.dispose();
  material.dispose();
});
