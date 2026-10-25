import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, OrthographicCamera, Vector3, Vector4 } from "three";
import { anchorRelativeDockedClip, dockedRoadBlend } from "./dockedRoadProjection";

function clip(camera: PerspectiveCamera | OrthographicCamera, point: Vector3): Vector4 {
  camera.updateMatrixWorld();
  return new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
}
describe("docked road composition", () => {
  it("retains physical contacts within one CSS pixel while the world camera moves behind the instrument", () => {
    const keyboard = new OrthographicCamera(-700, 700, 400, -400, 0.1, 10000);
    keyboard.position.set(0, 1100, 1400);
    keyboard.lookAt(0, 0, 0);
    for (const pose of [
      [1200, 900, 2000],
      [-1600, -400, -2200],
      [0, 35000, 80000]
    ]) {
      const world = new PerspectiveCamera(70, 16 / 9, 1, 200000);
      world.position.set(pose[0] ?? 0, pose[1] ?? 0, pose[2] ?? 0);
      world.lookAt(0, 0, 0);
      for (const [x, y, z] of [
        [-600, 22, -149.1938],
        [0, 34, -145.8],
        [600, 22, -149.1938]
      ]) {
        const point = new Vector3(x, y, z);
        const to = clip(keyboard, point);
        const result = anchorRelativeDockedClip(clip(world, point), clip(world, point), to, 0);
        expect(Math.abs((result.x / result.w - to.x / to.w) * 960)).toBeLessThan(1);
        expect(Math.abs((result.y / result.w - to.y / to.w) * 540)).toBeLessThan(1);
      }
    }
  });
  it("leaves the far three quarters on the world camera and joins with zero slope", () => {
    const world = { x: 10, y: 20, z: 0.5, w: 3 },
      key = { x: -10, y: -20, z: 0.1, w: 1 };
    expect(anchorRelativeDockedClip(world, world, key, 0.25)).toEqual(world);
    expect(anchorRelativeDockedClip(world, world, key, 1)).toEqual(world);
    const delta = 1e-6;
    expect(dockedRoadBlend(delta) / delta).toBeLessThan(0.001);
    expect((1 - dockedRoadBlend(0.25 - delta)) / delta).toBeLessThan(0.001);
    expect(anchorRelativeDockedClip(world, world, key, 0.1).x).not.toBe(
      anchorRelativeDockedClip(world, world, key, 0.2).x
    );
  });
});

it("uses the same screen blend for a distant perspective world and an orthographic keyboard", () => {
  const world = { x: 50000, y: 25000, z: 90000, w: 100000 };
  const keyboard = { x: -0.5, y: -0.5, z: 0, w: 1 };
  const result = anchorRelativeDockedClip(world, world, keyboard, 0.125);
  expect(result.x / result.w).toBeCloseTo(0);
  expect(result.y / result.w).toBeCloseTo(-0.125);
});

it("bounds the correction by the anchor delta even under a hundred-metre horizon", () => {
  const worldAnchor = { x: 2000, y: -1000, z: 9000, w: 10000 };
  const keyAnchor = { x: -0.6, y: -0.7, z: 0, w: 1 };
  const worldPoint = { x: 10000, y: 40000, z: 90000, w: 100000 };
  for (const progress of [0.01, 0.05, 0.125, 0.2, 0.249, 0.25, 1]) {
    const result = anchorRelativeDockedClip(worldPoint, worldAnchor, keyAnchor, progress);
    expect(Math.abs(result.x / result.w - worldPoint.x / worldPoint.w)).toBeLessThanOrEqual(
      0.800001
    );
    expect(Math.abs(result.y / result.w - worldPoint.y / worldPoint.w)).toBeLessThanOrEqual(
      0.600001
    );
  }
  expect(anchorRelativeDockedClip(worldAnchor, worldAnchor, keyAnchor, 0)).toEqual(keyAnchor);
  expect(anchorRelativeDockedClip(worldPoint, worldAnchor, keyAnchor, 0.25)).toEqual(worldPoint);
});
it("preserves behind-camera world clipping while the exact keyboard contact remains visible", () => {
  const behind = { x: 20, y: 30, z: -200, w: -100 };
  const key = { x: -0.5, y: -0.5, z: 0, w: 1 };
  expect(anchorRelativeDockedClip(behind, behind, key, 0)).toEqual(key);
  expect(anchorRelativeDockedClip(behind, behind, key, 0.25).w).toBeLessThan(0);
  const partial = anchorRelativeDockedClip(behind, behind, key, 0.2);
  expect(partial.w).toBeLessThan(0);
  expect(Object.values(partial).every(Number.isFinite)).toBe(true);
});
