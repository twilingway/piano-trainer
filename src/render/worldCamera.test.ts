import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  insidePolygon,
  keySurface,
  normalizeCamera,
  worldCamera
} from "./worldCamera";

describe("shared world camera", () => {
  it.each([22, 36, 48])(
    "moves a note at height %s uniformly on screen without moving its hit point",
    (keyHeight) => {
      for (const prefs of [DEFAULT_CAMERA, { ...DEFAULT_CAMERA, pitch: 40, fov: 30 }]) {
        const camera = worldCamera(1920, 1080, prefs);
        const nearZ = 142;
        const farZ = nearZ + 1500 * (1080 / 375);
        const far = camera.project(0, keyHeight, farZ);
        const near = camera.project(0, keyHeight, nearZ);
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const point = camera.projectAtProgress(0, keyHeight, nearZ, farZ, progress);
          expect(point.y).toBeCloseTo(far.y + (near.y - far.y) * progress);
          expect(point.scale).toBeGreaterThan(0);
        }
        expect(camera.projectAtProgress(0, keyHeight, nearZ, farZ, 1)).toEqual(near);
      }
    }
  );
  it.each([320, 390, 667, 768, 1920])("matches adaptive front widths at %spx", (width) => {
    const camera = worldCamera(width, 375);
    const whiteWidth = Math.min(44, width / 24);
    const surface = keySurface(camera, 0, false, whiteWidth);
    expect(surface.top[2].x - surface.top[3].x).toBeCloseTo(whiteWidth);
    const black = keySurface(camera, 0, true, whiteWidth * 0.6);
    expect(black.top[2].x - black.top[3].x).toBeLessThan(whiteWidth);
  });
  it.each([
    [390, 844],
    [667, 375],
    [1920, 1080]
  ])("keeps a default white front exactly 44px at %s by %s", (width, height) => {
    const camera = worldCamera(width, height);
    const a = camera.project(-11, 22, 0),
      b = camera.project(11, 22, 0);
    expect(b.x - a.x).toBeCloseTo(44, 8);
    expect(camera.project(0, 0, 0).y).toBeCloseTo(height - 8, 8);
    const rear = camera.project(0, 22, 142);
    expect(rear.y).toBeLessThan(a.y);
    expect(rear.y).toBeGreaterThan(height / 2);
  });
  it("uses identical XYZ for the road endpoint and the key rear", () => {
    const camera = worldCamera(667, 375);
    expect(camera.road.at(100, 1)).toEqual(camera.project(camera.sourceX(100), 22, 142));
    expect(camera.road.at(100, 0).scale).toBeLessThan(camera.road.at(100, 1).scale);
  });
  it("changes all geometry naturally when camera zoom changes", () => {
    const initial = worldCamera(667, 375),
      zoom = worldCamera(667, 375, { ...DEFAULT_CAMERA, fov: 25 });
    expect(zoom.project(11, 22, 0).x).toBeGreaterThan(initial.project(11, 22, 0).x);
    expect(zoom.road.at(355, 1).x).toBeGreaterThan(initial.road.at(355, 1).x);
  });
  it("sanitizes corrupt persisted parameters without losing valid fields", () => {
    expect(
      normalizeCamera({
        fov: Infinity,
        height: -10,
        pitch: 1000,
        scale: NaN,
        distance: 300,
        targetY: "bad"
      })
    ).toEqual({ ...DEFAULT_CAMERA, height: 25, pitch: 60, distance: 300 });
    expect(normalizeCamera(null)).toEqual(DEFAULT_CAMERA);
  });
  it("keeps all bounded cameras finite", () => {
    for (const pitch of [-5, 60])
      for (const height of [25, 420]) {
        const point = worldCamera(390, 844, {
          ...DEFAULT_CAMERA,
          pitch,
          height,
          distance: 120
        }).project(-500, 36, 0);
        expect([point.x, point.y, point.scale].every(Number.isFinite)).toBe(true);
      }
  });
  it("hit-tests projected quads rather than their overlapping bounding boxes", () => {
    const quad = [
      { x: 10, y: 0, scale: 1 },
      { x: 20, y: 0, scale: 1 },
      { x: 30, y: 20, scale: 1 },
      { x: 0, y: 20, scale: 1 }
    ];
    expect(insidePolygon(15, 10, quad)).toBe(true);
    expect(insidePolygon(1, 1, quad)).toBe(false);
  });
});

describe("physical key hit outlines", () => {
  it.each([false, true])("covers the visible top-left corner and front on black=%s", (black) => {
    const surface = keySurface(worldCamera(667, 375), -55, black);
    const centre = {
      x: surface.top.reduce((sum, p) => sum + p.x, 0) / 4,
      y: surface.top.reduce((sum, p) => sum + p.y, 0) / 4
    };
    for (const corner of surface.top) {
      expect(
        insidePolygon(
          corner.x * 0.95 + centre.x * 0.05,
          corner.y * 0.95 + centre.y * 0.05,
          surface.outline
        )
      ).toBe(true);
    }
    const frontX = surface.front.reduce((sum, p) => sum + p.x, 0) / 4;
    const frontY = surface.front.reduce((sum, p) => sum + p.y, 0) / 4;
    expect(insidePolygon(frontX, frontY, surface.outline)).toBe(true);
  });
  it("includes the painted black right-side wall, with black priority over the white below", () => {
    const camera = worldCamera(667, 375);
    const black = keySurface(camera, -100, true);
    const white = keySurface(camera, -89, false);
    const x = black.side.reduce((sum, p) => sum + p.x, 0) / 4;
    const y = black.side.reduce((sum, p) => sum + p.y, 0) / 4;
    expect(insidePolygon(x, y, black.outline)).toBe(true);
    const ordered = [
      { pitch: 60, polygon: white.outline },
      { pitch: 61, polygon: black.outline }
    ];
    expect([...ordered].reverse().find((face) => insidePolygon(x, y, face.polygon))?.pitch).toBe(
      61
    );
  });
});
