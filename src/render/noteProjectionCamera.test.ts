import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { CAMERA_PRESETS, KEYS_BACK, MAX_ROAD_WORLD_Z } from "./worldCamera";

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
        const target = Math.max(0, Math.min(630, near.y * horizon));
        expect(far.y).toBeCloseTo(target, 7);
        expect(notes.roadFarZ).toBeLessThanOrEqual(MAX_ROAD_WORLD_Z);
        expect(notes.roadFarZ).toBeGreaterThan(142);
        expect(Number.isFinite(notes.params.focal)).toBe(true);
      }
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
