import { describe, expect, it } from "vitest";
import { cameraGaze } from "./gazeMath";
import type { CameraGazeInput, GazePoint } from "./gazeMath";

const face = {
  origin: { x: 0, y: 0, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 }
};
const input = (cameraWorld: GazePoint): CameraGazeInput => ({ time: 60, face, cameraWorld });
describe("bounded camera attention", () => {
  it("looks forward and limits a close side/up camera without twisting like an owl", () => {
    expect(cameraGaze(input({ x: 0, y: 0, z: -1000 }))).toEqual({
      headYaw: 0,
      headPitch: 0,
      eyeYaw: 0,
      eyePitch: 0,
      weight: 1
    });
    const gaze = cameraGaze(input({ x: 700, y: 500, z: -1000 }));
    expect(gaze.headYaw).toBeGreaterThan(0);
    expect(gaze.headPitch).toBeGreaterThan(0);
    expect(gaze.headYaw).toBeLessThan((25 * Math.PI) / 180);
    expect(gaze.headPitch).toBeLessThan((12 * Math.PI) / 180);
    expect(Math.abs(gaze.eyeYaw)).toBeLessThan((8 * Math.PI) / 180);
    expect(Math.abs(gaze.eyePitch)).toBeLessThan((8 * Math.PI) / 180);
  });
  it("smoothly relinquishes a camera beside or behind the face", () => {
    const behind = cameraGaze(input({ x: 800, y: 0, z: 1000 }));
    expect(behind.weight).toBe(0);
    expect(behind.headYaw).toBe(0);
    expect(cameraGaze(input({ x: 1000, y: 0, z: 0 })).weight).toBe(0);
    const a = cameraGaze(input({ x: 1000, y: 0, z: -51 }));
    const b = cameraGaze(input({ x: 1000, y: 0, z: -51.001 }));
    expect(Math.abs(a.headYaw - b.headYaw)).toBeLessThan(1e-7);
  });
  it("uses a real world face basis instead of assuming bone-local axes", () => {
    const original = cameraGaze(input({ x: 250, y: 100, z: -1000 }));
    const rotate = (p: GazePoint): GazePoint => ({ x: -p.z, y: p.y, z: p.x });
    const turned = cameraGaze({
      time: 60,
      cameraWorld: rotate({ x: 250, y: 100, z: -1000 }),
      face: { origin: rotate(face.origin), forward: rotate(face.forward), up: rotate(face.up) }
    });
    expect(turned.headYaw).toBeCloseTo(original.headYaw, 12);
    expect(turned.headPitch).toBeCloseTo(original.headPitch, 12);
    expect(turned.eyeYaw).toBeCloseTo(original.eyeYaw, 12);
  });
  it("damps a target path deterministically through pause and arbitrary seek order", () => {
    const target = (t: number) => ({ x: t < 1 ? 0 : 500, y: 0, z: -1000 });
    const sample = (t: number) =>
      cameraGaze({
        ...input(target(t)),
        time: t,
        cameraAt: target
      });
    const first = sample(1);
    expect(first.headYaw).toBeLessThan(cameraGaze(input(target(1))).headYaw);
    sample(20);
    sample(0);
    sample(2);
    expect(sample(1)).toEqual(first);
    expect(sample(1)).toEqual(sample(1));
  });
  it("honours a smooth attention cue and safely ignores invalid/degenerate frames", () => {
    const base = input({ x: 250, y: 100, z: -1000 });
    const full = cameraGaze(base),
      half = cameraGaze({ ...base, attention: 0.5 });
    expect(half.headYaw).toBeCloseTo(full.headYaw / 2);
    for (const patch of [
      { time: NaN },
      { attention: NaN },
      { cameraWorld: face.origin },
      { face: { ...face, up: face.forward } }
    ])
      expect(cameraGaze({ ...base, ...patch }).weight).toBe(0);
  });
});
