import { describe, expect, it } from "vitest";
import { NOTE_SLAB_THICKNESS } from "./noteDimensions";
import { holdBounds } from "./holdBounds";
import { readableRoadTop } from "./readableRoadNote";
import {
  CAMERA_LIMITS,
  CAMERA_PRESETS,
  PANEL_EDGE,
  worldCamera,
  type WorldCamera
} from "./worldCamera";

function face(camera: WorldCamera, keyX: number, sourceY: number, width: number, hitY: number) {
  return camera.project(
    camera.sourceX(keyX),
    camera.near.y + (width / 2) * NOTE_SLAB_THICKNESS,
    camera.near.z + (1 - sourceY / hitY) * (camera.roadFarZ - camera.near.z)
  );
}

describe("readable road notes", () => {
  it.each(Object.entries(CAMERA_PRESETS))(
    "makes very short notes readable without moving contact in the %s view",
    (_, prefs) => {
      for (const [viewportWidth, viewportHeight] of [
        [390, 500],
        [1280, 640],
        [1920, 1000]
      ] as const) {
        const camera = worldCamera(viewportWidth, viewportHeight, prefs, PANEL_EDGE, 0.1);
        const hitY = camera.road.at(viewportWidth / 2, 1).y;
        for (const width of [12, 24, 44, 80])
          for (const progress of [0.3, 0.6, 1])
            for (const duration of [0.02, 0.08]) {
              const bottom = hitY * progress;
              const top = bottom - (duration / 2.22) * hitY;
              const before = face(camera, viewportWidth / 2, bottom, width, hitY);
              const adjusted = readableRoadTop(viewportWidth / 2, top, bottom, width, hitY, camera);
              const after = face(camera, viewportWidth / 2, adjusted, width, hitY);
              const minimum =
                camera.params.orthographicScale === undefined
                  ? Math.max(24, Math.min(64, width * before.scale * 0.8))
                  : Math.max(18, Math.min(30, width * before.scale * 0.8));
              const available = before.y - face(camera, viewportWidth / 2, 0, width, hitY).y;
              expect(before.y - after.y).toBeGreaterThanOrEqual(
                Math.min(minimum, available) - 1e-6
              );
              expect(adjusted).toBeGreaterThanOrEqual(0);
              expect(adjusted).toBeLessThanOrEqual(top);
              expect(face(camera, viewportWidth / 2, bottom, width, hitY)).toEqual(before);
            }
      }
    }
  );

  it.each(Object.entries(CAMERA_PRESETS))(
    "preserves long duration bars exactly in the %s view",
    (_, prefs) => {
      const camera = worldCamera(1280, 640, prefs, PANEL_EDGE, 0.1);
      const hitY = camera.road.at(640, 1).y;
      for (const [top, bottom] of [
        [hitY * 0.1, hitY * 0.8],
        [hitY * 0.45, hitY],
        [0, hitY]
      ] as const)
        expect(readableRoadTop(640, top, bottom, 44, hitY, camera)).toBe(top);
    }
  );

  it("consumes a sustained note continuously through impact and its final frame", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    const hitY = camera.road.at(640, 1).y;
    const duration = 2;
    for (const time of [0.999, 1, 1.001, 2.95, 2.99, 2.999, 3]) {
      const { top, bottom } = holdBounds(1, duration, time, 2.22, hitY);
      expect(readableRoadTop(640, top, bottom, 44, hitY, camera, duration)).toBe(top);
    }
    const tail = holdBounds(1, duration, 2.999, 2.22, hitY);
    expect(tail.bottom - tail.top).toBeLessThan(1);
    const short = holdBounds(1, 0.01, 0.9, 2.22, hitY);
    expect(readableRoadTop(640, short.top, short.bottom, 44, hitY, camera, 0.01)).toBeLessThan(
      short.top
    );
  });

  it("keeps short perspective blocks proportional to their visible width", () => {
    const camera = worldCamera(1920, 828, CAMERA_PRESETS.player, PANEL_EDGE, 0.1);
    const hitY = camera.road.at(960, 1).y;
    for (const width of [44, 80, 120]) {
      const bottom = hitY * 0.95;
      const top = readableRoadTop(960, bottom - 0.1, bottom, width, hitY, camera, 0.08);
      const lower = face(camera, 960, bottom, width, hitY);
      const upper = face(camera, 960, top, width, hitY);
      expect(lower.y - upper.y).toBeGreaterThanOrEqual(24 - 1e-6);
      expect(lower.y - upper.y).toBeLessThanOrEqual(64 + 1e-6);
      expect(lower.y - upper.y).toBeCloseTo(
        Math.min(64, Math.max(24, width * lower.scale * 0.8)),
        6
      );
    }
  });

  it("stops at the horizon when there is insufficient room for the digit", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    const hitY = camera.road.at(640, 1).y;
    expect(readableRoadTop(640, 0.5, 1, 44, hitY, camera)).toBe(0);
    expect(readableRoadTop(640, 0, 1, 44, hitY, camera)).toBe(0);
  });
  it("uses constant overhead scale for short notes at every depth and source width", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    expect(camera.params.orthographicScale).toBeGreaterThan(0);
    const hitY = camera.road.at(640, 1).y;
    for (const width of [12, 24, 44, 80]) {
      let previousLength = 0;
      for (const progress of [0.3, 0.6, 1]) {
        const bottom = hitY * progress;
        const top = readableRoadTop(640, bottom - 0.1, bottom, width, hitY, camera);
        const projected = face(camera, 640, bottom, width, hitY);
        const minimum = Math.max(18, Math.min(30, width * projected.scale * 0.8));
        expect(projected.y - face(camera, 640, top, width, hitY).y).toBeCloseTo(minimum, 8);
        if (previousLength > 0) expect(bottom - top).toBeCloseTo(previousLength, 8);
        previousLength = bottom - top;
      }
    }
  });

  it("caps additional screen height and leaves horizontal projection unchanged", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    const hitY = camera.road.at(640, 1).y;
    const bottom = hitY * 0.8;
    for (const keyX of [300, 640, 980]) {
      const width = 90;
      const top = readableRoadTop(keyX, bottom - 0.1, bottom, width, hitY, camera);
      const a = face(camera, keyX, top, width, hitY);
      const b = face(camera, keyX, bottom, width, hitY);
      expect(b.y - a.y).toBeCloseTo(30, 6);
      expect(readableRoadTop(keyX, top, bottom, width, hitY, camera)).toBeCloseTo(top, 8);
      expect(readableRoadTop(640, bottom - 0.1, bottom, width, hitY, camera)).toBeCloseTo(top);
    }
  });

  it("returns original bounds for invalid inputs", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.top, PANEL_EDGE, 0.1);
    const args = [640, 100, 101, 44, 500] as const;
    for (const index of [0, 2, 3, 4])
      for (const invalid of [NaN, Infinity, -Infinity]) {
        const changed: [number, number, number, number, number] = [...args];
        changed[index] = invalid;
        expect(
          readableRoadTop(changed[0], changed[1], changed[2], changed[3], changed[4], camera)
        ).toBe(100);
      }
    expect(readableRoadTop(640, 100, 99, 44, 500, camera)).toBe(100);
    expect(readableRoadTop(640, 100, 101, 0, 500, camera)).toBe(100);
    expect(readableRoadTop(640, 100, 101, 44, 0, camera)).toBe(100);
    expect(readableRoadTop(640, NaN, 101, 44, 500, camera)).toBeNaN();
  });

  it("keeps results bounded at every persisted camera limit", () => {
    for (const fov of CAMERA_LIMITS.fov)
      for (const height of CAMERA_LIMITS.height)
        for (const distance of CAMERA_LIMITS.distance)
          for (const pitch of CAMERA_LIMITS.pitch)
            for (const targetY of CAMERA_LIMITS.targetY)
              for (const scale of CAMERA_LIMITS.scale) {
                const camera = worldCamera(
                  1280,
                  640,
                  { fov, height, distance, pitch, targetY, scale },
                  PANEL_EDGE,
                  0.1
                );
                for (const bottom of [1, 250, 500]) {
                  const top = bottom - 0.1;
                  const adjusted = readableRoadTop(640, top, bottom, 44, 500, camera);
                  expect(Number.isFinite(adjusted)).toBe(true);
                  expect(adjusted).toBeGreaterThanOrEqual(0);
                  expect(adjusted).toBeLessThanOrEqual(top);
                }
              }
  });
});
