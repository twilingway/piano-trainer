import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, OrthographicCamera, Vector3, Vector4 } from "three";
import {
  anchorRelativeDockedClip,
  dockedRoadBlend,
  dockedScreenPoint
} from "./dockedRoadProjection";

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
  const contact = anchorRelativeDockedClip(worldAnchor, worldAnchor, keyAnchor, 0);
  expect([contact.x / contact.w, contact.y / contact.w, contact.z / contact.w]).toEqual([
    keyAnchor.x,
    keyAnchor.y,
    keyAnchor.z
  ]);
  expect(anchorRelativeDockedClip(worldPoint, worldAnchor, keyAnchor, 0.25)).toEqual(worldPoint);
});
it("carries the point's own w through the whole near quarter so varyings stay straight", () => {
  // A w mixed in from the keyboard camera kept the pixels but bent rims and halos into combs.
  const world = { x: 10, y: 20, z: 0.5, w: 3 },
    key = { x: -0.5, y: -0.5, z: 0.1, w: 1 };
  for (const progress of [0, 1e-4, 0.05, 0.125, 0.2, 0.25 - 1e-4]) {
    const result = anchorRelativeDockedClip(world, world, key, progress);
    expect(result.w).toBeCloseTo(world.w, 9);
  }
  const contact = anchorRelativeDockedClip(world, world, key, 0);
  expect(contact.x / contact.w).toBeCloseTo(key.x / key.w, 9);
  expect(contact.y / contact.w).toBeCloseTo(key.y / key.w, 9);
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
it("keeps a fitted route straight from the far end to the keyboard contact", () => {
  const world = new PerspectiveCamera(50, 16 / 9, 1, 200000);
  world.position.set(0, 1800, 900);
  world.lookAt(0, 0, -3000);
  const keyboard = new OrthographicCamera(-700, 700, 400, -400, 0.1, 10000);
  keyboard.position.set(0, 1400, 900);
  keyboard.lookAt(0, 0, 0);
  const contact = new Vector3(240, 20, -150),
    far = new Vector3(120, 20, -6000);
  const anchor = clip(world, contact),
    pinned = clip(keyboard, contact);
  const ndc = (p: { x: number; y: number; w: number }) => [p.x / p.w, p.y / p.w] as const;
  const points = [0, 0.05, 0.2, 0.25, 0.5, 0.8, 1].map((progress) => {
    const point = clip(world, contact.clone().lerp(far, progress));
    return ndc(anchorRelativeDockedClip(point, anchor, pinned, progress, undefined, pinned));
  });
  const [start, end] = [points[0] ?? [0, 0], points[points.length - 1] ?? [0, 0]];
  expect(start[0]).toBeCloseTo(ndc(pinned)[0], 6);
  expect(start[1]).toBeCloseTo(ndc(pinned)[1], 6);
  expect(end[0]).toBeCloseTo(ndc(clip(world, far))[0], 6);
  expect(end[1]).toBeCloseTo(ndc(clip(world, far))[1], 6);
  const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
  for (const [x, y] of points)
    expect(Math.abs((x - start[0]) * dy - (y - start[1]) * dx) * 960).toBeLessThan(0.01);
  // The plain bend of the same route is visibly not straight.
  const bent = [0.1, 0.5].map((progress) =>
    ndc(
      anchorRelativeDockedClip(
        clip(world, contact.clone().lerp(far, progress)),
        anchor,
        pinned,
        progress
      )
    )
  );
  const [bx, by] = bent[0] ?? [0, 0];
  expect(Math.abs((bx - start[0]) * dy - (by - start[1]) * dx) * 960).toBeGreaterThan(1);
});
it("matches the clip straight offset in screen pixels through the scale ratio", () => {
  const anchor = { x: 400, y: 700, scale: 2 },
    fitted = { x: 380, y: 760 },
    point = { x: 450, y: 300, scale: 0.5 };
  const result = dockedScreenPoint(point, anchor, fitted, 0.5, fitted);
  // (1 - 0.5) * 0.5 / 2 of the contact delta.
  expect(result.x).toBeCloseTo(450 + 0.125 * -20);
  expect(result.y).toBeCloseTo(300 + 0.125 * 60);
  expect(dockedScreenPoint({ ...anchor }, anchor, fitted, 0, fitted)).toMatchObject(fitted);
});
describe("bent join in keyboard perspective", () => {
  const world = new PerspectiveCamera(50, 16 / 9, 1, 200000);
  world.position.set(0, 1800, 900);
  world.lookAt(0, 0, -3000);
  // A tilted keyboard camera that no longer matches the fitted snapshot.
  const keyboard = new PerspectiveCamera(30, 16 / 9, 1, 200000);
  keyboard.position.set(0, 400, 1300);
  keyboard.lookAt(0, 0, -150);
  const contact = new Vector3(-600, 20, -150),
    far = new Vector3(-300, 20, -6000);
  const anchor = clip(world, contact),
    pinned = clip(keyboard, contact);
  const ndc = (p: { x: number; y: number; w: number }) => [p.x / p.w, p.y / p.w] as const;
  const at = (progress: number) => contact.clone().lerp(far, progress);
  const [cx, cy] = ndc(pinned);

  it("leaves the key along the lane's own keyboard projection", () => {
    const [kx, ky] = ndc(clip(keyboard, at(0.25)));
    // Pixel distance from the keyboard lane through the contact at 1568x733.
    const offLane = (progress: number, lean: boolean) => {
      const result = anchorRelativeDockedClip(
        clip(world, at(progress)),
        anchor,
        pinned,
        progress,
        undefined,
        undefined,
        lean ? clip(keyboard, at(progress)) : undefined
      );
      const [x, y] = ndc(result);
      const along = (y - cy) / (ky - cy);
      return Math.abs(x - (cx + (kx - cx) * along)) * 784;
    };
    // Only the smoothstep's own start (t ~ 0.7 % at 0.01) is left off the keyboard lane.
    expect(offLane(0.01, true)).toBeLessThan(0.5);
    expect(offLane(0.03, true)).toBeLessThan(3);
    // The plain bend leaves the key along the contact delta instead.
    expect(offLane(0.01, false)).toBeGreaterThan(10);
    expect(offLane(0.03, false)).toBeGreaterThan(10);
  });

  it("keeps the near-quarter boundary and the contact in place", () => {
    const key = clip(keyboard, at(0.25));
    const edge = clip(world, at(0.25));
    expect(anchorRelativeDockedClip(edge, anchor, pinned, 0.25, undefined, undefined, key)).toEqual(
      edge
    );
    const start = anchorRelativeDockedClip(anchor, anchor, pinned, 0, undefined, undefined, pinned);
    expect(ndc(start)[0]).toBeCloseTo(cx, 9);
    expect(ndc(start)[1]).toBeCloseTo(cy, 9);
  });

  it("stays straight when the shown keys match the fitted contact", () => {
    for (const progress of [0.02, 0.1, 0.2]) {
      const point = clip(world, at(progress));
      const lane = clip(keyboard, at(progress));
      expect(
        anchorRelativeDockedClip(point, anchor, pinned, progress, undefined, pinned, lane)
      ).toEqual(anchorRelativeDockedClip(point, anchor, pinned, progress, undefined, pinned));
    }
  });

  it("matches the clip join in screen pixels", () => {
    const [width, height] = [1568, 733];
    const px = (p: { x: number; y: number; w: number }) => ({
      x: ((p.x / p.w + 1) * width) / 2,
      y: ((1 - p.y / p.w) * height) / 2
    });
    for (const progress of [0.02, 0.1, 0.2]) {
      const point = clip(world, at(progress)),
        lane = clip(keyboard, at(progress));
      const expected = px(
        anchorRelativeDockedClip(point, anchor, pinned, progress, undefined, undefined, lane)
      );
      const result = dockedScreenPoint(
        px(point),
        px(anchor),
        px(pinned),
        progress,
        undefined,
        px(lane),
        height
      );
      expect(result.x).toBeCloseTo(expected.x, 6);
      expect(result.y).toBeCloseTo(expected.y, 6);
    }
  });
});
