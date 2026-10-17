import { NOTE_SLAB_THICKNESS } from "../noteDimensions";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutKeyboard } from "../keyboardLayout";
import { CAMERA_PRESETS, PANEL_EDGE, worldCamera } from "../worldCamera";
import type { WorldCamera } from "../worldCamera";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import { worldRoadNote } from "./roadNoteGeometry";
import type { WorldRoadNote } from "./roadNoteGeometry";

const empty = (): WorldRoadNote => ({ x: 0, top: 0, bottom: 0, width: 0, color: 0, alpha: 0 });

describe("road note world geometry", () => {
  it("clips both ends to the road and keeps color, opacity and half-pixel world scale", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.player, PANEL_EDGE);
    const note = worldRoadNote(640, -20, 600, 44, 0xff9400, 1.5, 480, camera);
    expect(note).toEqual({
      x: 0,
      top: camera.roadFarZ,
      bottom: PANEL_EDGE.z,
      width: 22,
      color: 0xff9400,
      alpha: 1
    });
  });

  it("reuses the supplied snapshot and leaves it unchanged for invalid or clipped-empty input", () => {
    const camera = worldCamera(1280, 640, CAMERA_PRESETS.player, PANEL_EDGE);
    const target = empty();
    expect(worldRoadNote(700, 20, 300, 30, 0x00a9f5, 0.8, 480, camera, target)).toBe(target);
    const before = { ...target };
    const cases: readonly (readonly [number, number, number, number, number, number, number])[] = [
      [NaN, 0, 300, 30, 0xffffff, 1, 480],
      [700, NaN, 300, 30, 0xffffff, 1, 480],
      [700, 0, Infinity, 30, 0xffffff, 1, 480],
      [700, 0, 300, 0, 0xffffff, 1, 480],
      [700, 0, 300, -1, 0xffffff, 1, 480],
      [700, 0, 300, 30, NaN, 1, 480],
      [700, 0, 300, 30, 0xffffff, 0, 480],
      [700, 0, 300, 30, 0xffffff, NaN, 480],
      [700, 0, 300, 30, 0xffffff, 1, 0],
      [700, 0, 300, 30, 0xffffff, 1, Infinity],
      [700, 500, 700, 30, 0xffffff, 1, 480],
      [700, -100, -20, 30, 0xffffff, 1, 480],
      [700, 300, 20, 30, 0xffffff, 1, 480]
    ];
    for (const args of cases) {
      expect(worldRoadNote(...args, camera, target)).toBeUndefined();
      expect(target).toEqual(before);
    }
    expect(
      worldRoadNote(
        700,
        0,
        300,
        30,
        0xffffff,
        1,
        480,
        { ...camera, roadFarZ: camera.near.z },
        target
      )
    ).toBeUndefined();
    expect(
      worldRoadNote(
        700,
        0,
        300,
        30,
        0xffffff,
        1,
        480,
        { ...camera, sourceX: () => Infinity },
        target
      )
    ).toBeUndefined();
  });

  it("lands on the same road and contact line for 49, 61 and 88 keys in all presets", () => {
    let checked = 0;
    for (const [low, high] of [
      [36, 84],
      [24, 84],
      [21, 108]
    ] as const) {
      const keys = layoutKeyboard(1280, low, high);
      expect(keys.size).toBe(high - low + 1);
      for (const prefs of Object.values(CAMERA_PRESETS)) {
        const camera = worldCamera(1280, 640, prefs, PANEL_EDGE);
        const view = viewMatrix(camera.params);
        for (const pan of [0, 160]) {
          for (const offset of [
            { x: 0, y: 0 },
            { x: 35, y: -60 }
          ]) {
            const projection = projectionMatrix(camera.params, 1280, 720, offset);
            for (const key of keys.values()) {
              const keyX = key.x + key.width / 2;
              const note = worldRoadNote(
                keyX,
                120,
                480,
                key.width * 1.08,
                0xff9400,
                1,
                480,
                camera
              );
              if (!note) throw new Error("Expected a visible road note");
              expect(note.bottom).toBe(camera.near.z);
              for (const [depth, progress] of [
                [note.top, 0.25],
                [note.bottom, 1]
              ] as const) {
                const expected = camera.road.at(keyX - pan, progress);
                const ndc = new Vector3(
                  (note.x - pan / 2) * prefs.scale,
                  camera.near.y * prefs.scale,
                  -depth * prefs.scale
                )
                  .applyMatrix4(view)
                  .applyMatrix4(projection);
                expect((ndc.x + 1) * 640).toBeCloseTo(expected.x + offset.x, 5);
                expect((1 - ndc.y) * 360).toBeCloseTo(expected.y + offset.y, 5);
                checked++;
              }
              // Existing Pixi labels use lift=.28*sourceWidth, and notePlace divides that by two.
              expect(camera.near.y + note.width * NOTE_SLAB_THICKNESS).toBeCloseTo(
                camera.near.y + (key.width * 1.08 * NOTE_SLAB_THICKNESS) / 2
              );
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(4000);
  });

  it("rejects degenerate camera spans without creating non-finite world coordinates", () => {
    const camera: WorldCamera = worldCamera(1280, 640);
    for (const invalid of [
      { ...camera, roadFarZ: Infinity },
      { ...camera, near: { y: 22, z: NaN } }
    ]) {
      expect(worldRoadNote(640, 0, 480, 44, 0xffffff, 1, 480, invalid)).toBeUndefined();
    }
  });
});
