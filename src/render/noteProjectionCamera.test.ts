import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import {
  CAMERA_PRESETS,
  DEFAULT_CAMERA,
  KEYS_BACK,
  MAX_ROAD_WORLD_Z,
  SAFE_VIEW_DEPTH
} from "./worldCamera";

const PROJECTIONS = ["direct", "perspective"] as const;

describe("independent note projection camera", () => {
  it("preserves the piano camera and every panned lane contact for all piano presets", () => {
    for (const width of [320, 1440, 1920])
      for (const sceneWidth of [660, 2288])
        for (const preset of Object.values(CAMERA_PRESETS)) {
          const keyboard = roadLayoutCamera(width, sceneWidth, 700, preset, true, 0.1);
          const before = JSON.stringify(keyboard.params);
          const keyCorners = [keyboard.project(-220, 22, 0), keyboard.project(160, 36, 142)];
          for (const projection of PROJECTIONS) {
            const notes = noteProjectionCamera(keyboard, projection, 700, 0.1);
            expect(notes.params.prefs.pitch).toBe(projection === "direct" ? 90 : 25);
            expect(notes.params.prefs.scale).toBe(preset.scale);
            expect(notes.sourceX).toBe(keyboard.sourceX);
            expect(notes.near).toBe(KEYS_BACK);
            for (const pan of [0, 424, 1300])
              for (const source of [0, 44, width / 2, sceneWidth]) {
                const x = notes.sourceX(source - pan);
                const expected = keyboard.project(x, KEYS_BACK.y, KEYS_BACK.z);
                const actual = notes.project(x, KEYS_BACK.y, KEYS_BACK.z);
                expect(actual.x).toBeCloseTo(expected.x, 8);
                expect(actual.y).toBeCloseTo(expected.y, 8);
                expect(actual.scale).toBeCloseTo(expected.scale, 8);
              }
            expect(JSON.stringify(keyboard.params)).toBe(before);
            expect([keyboard.project(-220, 22, 0), keyboard.project(160, 36, 142)]).toEqual(
              keyCorners
            );
          }
        }
  });

  it("keeps direct notes parallel above an angled piano and converges perspective above a top piano", () => {
    const player = roadLayoutCamera(1440, 2288, 700, CAMERA_PRESETS.player, true, 0.1);
    const top = mixedKeyboardCamera(player, 170);
    for (const keyboard of [player, top]) {
      const direct = noteProjectionCamera(keyboard, "direct", 700);
      const perspective = noteProjectionCamera(keyboard, "perspective", 700);
      const near = direct.project(200, 22, direct.near.z);
      expect(direct.project(200, 22, direct.roadFarZ).x).toBeCloseTo(near.x, 9);
      const far = perspective.project(200, 22, perspective.roadFarZ);
      const contact = perspective.project(200, 22, perspective.near.z);
      const centre = perspective.params.originX ?? 0;
      expect(Math.abs(far.x - centre)).toBeLessThan(Math.abs(contact.x - centre) * 0.8);
      expect(far.scale).toBeLessThan(contact.scale * 0.8);
    }
    expect(player.params.prefs.pitch).toBe(42);
    expect(top.params.prefs.pitch).toBe(90);
  });

  it("reaches the requested horizon with a tiny fitted 88-key piano, within the far clip", () => {
    const keyboard = roadLayoutCamera(320, 2288, 700, CAMERA_PRESETS.top, true, 0.1);
    for (const projection of PROJECTIONS)
      for (const horizon of [0, 0.1, 0.5, 0.95]) {
        const notes = noteProjectionCamera(keyboard, projection, 700, horizon);
        const near = notes.project(0, 22, 142);
        const far = notes.project(0, 22, notes.roadFarZ);
        const legacy = (share: number) => Math.max(0, Math.min(630, near.y * share));
        const target =
          projection === "direct" || horizon <= 0.6
            ? legacy(horizon)
            : legacy(0.6) + ((near.y - legacy(0.6)) * (horizon - 0.6)) / 0.4;
        expect(far.y).toBeCloseTo(target, 7);
        expect(notes.roadFarZ).toBeLessThanOrEqual(MAX_ROAD_WORLD_Z);
        expect(notes.roadFarZ).toBeGreaterThan(142);
        expect(Number.isFinite(notes.params.focal)).toBe(true);
      }
  });

  it("preserves the legacy 0..60% target, pitch, height and far-depth calibration", () => {
    const keyboard = roadLayoutCamera(1440, 2288, 700, CAMERA_PRESETS.player, true, 0.1);
    const hit = keyboard.project(0, KEYS_BACK.y, KEYS_BACK.z);
    const pixels = keyboard.project(1, KEYS_BACK.y, KEYS_BACK.z).x - hit.x;
    const radians = (25 * Math.PI) / 180;
    for (const share of [0, 0.1, 0.3, 0.6]) {
      const camera = noteProjectionCamera(keyboard, "perspective", 700, share);
      const target = Math.max(0, Math.min(630, hit.y * share));
      const travel = hit.y - target;
      const expectedHeight = Math.max(
        (KEYS_BACK.y + 1) / keyboard.params.fit,
        (KEYS_BACK.y + (travel * Math.cos(radians)) / (pixels * 0.9)) / keyboard.params.fit
      );
      const depthZ = KEYS_BACK.z + DEFAULT_CAMERA.distance * keyboard.params.fit;
      const expectedFar = KEYS_BACK.z + (travel * Math.sin(radians)) / (pixels * 0.1) + depthZ * 9;
      expect(camera.params.prefs.pitch).toBe(25);
      expect(camera.params.prefs.height).toBeCloseTo(expectedHeight, 8);
      expect(camera.roadFarZ).toBeCloseTo(expectedFar, 7);
      expect(camera.project(0, KEYS_BACK.y, camera.roadFarZ).y).toBeCloseTo(target, 7);
    }
  });

  it.each([0.99, 1, 1.01, 1.2, 1.5])(
    "crosses the key line continuously at horizon %s with fitted 88-key scales",
    (share) => {
      for (const width of [320, 1440])
        for (const scale of [0.55, 1.6]) {
          const keyboard = roadLayoutCamera(
            width,
            2288,
            700,
            { ...CAMERA_PRESETS.top, scale },
            true,
            0.1
          );
          const unchanged = JSON.stringify(keyboard.params);
          const camera = noteProjectionCamera(keyboard, "perspective", 700, share);
          const near = camera.project(0, KEYS_BACK.y, KEYS_BACK.z);
          const legacy = Math.max(0, Math.min(630, near.y * 0.6));
          const target =
            share <= 1 ? legacy + ((near.y - legacy) * (share - 0.6)) / 0.4 : near.y * share;
          const far = camera.project(0, KEYS_BACK.y, camera.roadFarZ);
          expect(far.y).toBeCloseTo(target, 7);
          expect(camera.roadFarZ).toBeGreaterThan(KEYS_BACK.z);
          expect(camera.roadFarZ).toBeLessThanOrEqual(MAX_ROAD_WORLD_Z);
          expect(far.scale / near.scale).toBeCloseTo(0.1, 7);
          expect(Math.abs(camera.params.prefs.pitch)).toBeLessThanOrEqual(
            25 * Math.min(1, Math.abs(1 - share) / 0.4) + 1e-9
          );
          expect(Math.sign(camera.params.prefs.pitch)).toBe(Math.sign(1 - share));
          if (share > 1)
            expect(camera.params.prefs.height).toBeLessThan(
              (KEYS_BACK.y * scale) / keyboard.params.fit
            );
          const view = viewMatrix(camera.params);
          const projection = projectionMatrix(camera.params, width, 900);
          for (const pan of [0, 424])
            for (const x of [-200, 300])
              for (const y of [22, 34]) {
                const worldX = camera.sourceX(x - pan);
                for (const z of [
                  KEYS_BACK.z,
                  (KEYS_BACK.z + camera.roadFarZ) / 2,
                  camera.roadFarZ
                ]) {
                  const actual = camera.project(worldX, y, z);
                  const ndc = new Vector3(worldX * scale, y * scale, -z * scale)
                    .applyMatrix4(view)
                    .applyMatrix4(projection);
                  expect(((ndc.x + 1) * width) / 2).toBeCloseTo(actual.x, 7);
                  expect(((1 - ndc.y) * 900) / 2).toBeCloseTo(actual.y, 7);
                  expect(ndc.z).toBeGreaterThan(-1);
                  expect(ndc.z).toBeLessThan(1);
                }
                const expected = keyboard.project(worldX, KEYS_BACK.y, KEYS_BACK.z);
                const contact = camera.project(worldX, KEYS_BACK.y, KEYS_BACK.z);
                expect(contact.x).toBeCloseTo(expected.x, 7);
                expect(contact.y).toBeCloseTo(expected.y, 7);
              }
          expect(JSON.stringify(keyboard.params)).toBe(unchanged);
        }
    }
  );

  it("retains finite taper at 100% and expands its internal far width only for impossible 10% budgets", () => {
    for (const height of [700, 22000]) {
      const keyboard = roadLayoutCamera(320, 2288, height, CAMERA_PRESETS.top, true, 0.1);
      const camera = noteProjectionCamera(keyboard, "perspective", height, 1);
      const near = camera.project(0, KEYS_BACK.y, KEYS_BACK.z);
      const far = camera.project(0, KEYS_BACK.y, camera.roadFarZ);
      expect(camera.params.prefs.pitch).toBe(0);
      expect(far.y).toBeCloseTo(near.y, 7);
      expect(camera.roadFarZ).toBeLessThanOrEqual(MAX_ROAD_WORLD_Z);
      const depth =
        camera.roadFarZ * camera.params.prefs.scale + DEFAULT_CAMERA.distance * camera.params.fit;
      expect(depth).toBeLessThan(SAFE_VIEW_DEPTH);
      if (height === 700) expect(far.scale / near.scale).toBeCloseTo(0.1, 7);
      else expect(far.scale / near.scale).toBeGreaterThan(0.1);
    }
    const keyboard = roadLayoutCamera(1440, 2288, 700, CAMERA_PRESETS.player, true, 0.1);
    const invalidBudget = { ...keyboard, params: { ...keyboard.params, fit: 1e9 } };
    expect(noteProjectionCamera(invalidBudget, "perspective", 700, 1)).toBe(invalidBudget);
    const fallback = noteProjectionCamera(keyboard, "perspective", NaN, NaN);
    expect(
      Object.values(fallback.project(0, KEYS_BACK.y, fallback.roadFarZ)).every(Number.isFinite)
    ).toBe(true);
  });

  it("matches CPU and Three off-axis projection including pan and custom piano scale", () => {
    const width = 1440,
      height = 900;
    for (const preset of Object.values(CAMERA_PRESETS)) {
      const keyboard = roadLayoutCamera(
        width,
        2288,
        700,
        { ...preset, scale: 1.35, targetY: -50 },
        true,
        0.1
      );
      for (const projection of PROJECTIONS) {
        const notes = noteProjectionCamera(keyboard, projection, 700, 0.1);
        const view = viewMatrix(notes.params);
        const matrix = projectionMatrix(notes.params, width, height);
        for (const pan of [0, 424])
          for (const x of [-200, 0, 300])
            for (const y of [22, 32, 44])
              for (const z of [142, (142 + notes.roadFarZ) / 2, notes.roadFarZ]) {
                const worldX = x - pan / 2;
                const expected = notes.project(worldX, y, z);
                const scale = notes.params.prefs.scale;
                const ndc = new Vector3(worldX * scale, y * scale, -z * scale)
                  .applyMatrix4(view)
                  .applyMatrix4(matrix);
                expect(((ndc.x + 1) * width) / 2).toBeCloseTo(expected.x, 7);
                expect(((1 - ndc.y) * height) / 2).toBeCloseTo(expected.y, 7);
                expect(ndc.z).toBeGreaterThan(-1);
                expect(ndc.z).toBeLessThan(1);
              }
      }
    }
  });
});
