import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS, DEFAULT_CAMERA, KEYS_BACK, PANEL_EDGE, worldCamera } from "./worldCamera";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";

describe("derived overhead keyboard camera", () => {
  it.each([PANEL_EDGE, KEYS_BACK])(
    "joins every lane at contact $y/$z, independently of black-key height or pan",
    (contact) => {
      for (const [width, height] of [
        [390, 700],
        [1280, 640]
      ])
        for (const pitch of [-5, 25, 42, 89, 90])
          for (const scale of [0.55, 1, 1.6]) {
            if (width === undefined || height === undefined) throw new Error("missing viewport");
            const road = worldCamera(
              width,
              height,
              { ...DEFAULT_CAMERA, pitch, scale },
              contact,
              0.1
            );
            const keyboard = mixedKeyboardCamera(road, 180);
            const hitY = road.project(0, contact.y, contact.z).y;
            for (const pan of [0, 90, 700])
              for (const source of [0, 44, width / 2, width, 1800]) {
                const x = road.sourceX(source - pan);
                const anchor = road.project(x, contact.y, contact.z);
                for (const y of [0, 22, 36, 160]) {
                  const rear = keyboard.project(x, y, 142);
                  expect(rear.x).toBeCloseTo(anchor.x, 7);
                  expect(rear.y).toBeCloseTo(hitY, 7);
                  expect(keyboard.project(x, y, 0).y - rear.y).toBeCloseTo(180, 7);
                }
              }
            expect(keyboard.sourceX).toBe(road.sourceX);
            expect(road.params.prefs.pitch).toBe(pitch);
          }
    }
  );

  it("maps its off-axis X/Y scales identically on CPU and Three including pan and detached offset", () => {
    const width = 1280,
      height = 800;
    const road = worldCamera(
      width,
      640,
      { ...DEFAULT_CAMERA, scale: 1.4, targetY: 57 },
      KEYS_BACK,
      0.1
    );
    const keyboard = mixedKeyboardCamera(road, 240);
    const view = viewMatrix(keyboard.params);
    const offset = { x: 32, y: -25 };
    const projection = projectionMatrix(keyboard.params, width, height, offset);
    for (const pan of [0, 160])
      for (const x of [-600, -11, 0, 400])
        for (const y of [0, 22, 36, 180])
          for (const z of [-40, 0, 57, 142]) {
            const sourceX = x - pan / 2;
            const expected = keyboard.project(sourceX, y, z);
            const scale = road.params.prefs.scale;
            const ndc = new Vector3(sourceX * scale, y * scale, -z * scale)
              .applyMatrix4(view)
              .applyMatrix4(projection);
            expect(((ndc.x + 1) * width) / 2).toBeCloseTo(expected.x + offset.x, 7);
            expect(((1 - ndc.y) * height) / 2).toBeCloseTo(expected.y + offset.y, 7);
            expect(ndc.z).toBeGreaterThan(-1);
            expect(ndc.z).toBeLessThan(1);
          }
    expect(keyboard.params.orthographicScale).not.toBe(keyboard.params.orthographicScaleY);
  });

  it("changes only vertical keyboard framing and inherits an already fitted overhead road scale once", () => {
    const road = worldCamera(390, 700, CAMERA_PRESETS.top, PANEL_EDGE, 0.1, {
      left: -600,
      right: 600,
      pan: 0
    });
    const short = mixedKeyboardCamera(road, 90);
    const tall = mixedKeyboardCamera(road, 220);
    expect(short.params.orthographicScale).toBeCloseTo(road.params.orthographicScale ?? 0, 9);
    expect(tall.params.orthographicScale).toBeCloseTo(short.params.orthographicScale ?? 0, 9);
    expect(short.project(200, 22, 142)).toEqual(tall.project(200, 22, 142));
    expect(tall.project(200, 22, 0).y - short.project(200, 22, 0).y).toBeCloseTo(130);
    expect(road.params.prefs).toBe(CAMERA_PRESETS.top);
  });

  it("uses a finite unchanged fallback for invalid keyboard geometry", () => {
    const road = worldCamera(390, 700, CAMERA_PRESETS.player, PANEL_EDGE, 0.1);
    for (const height of [0, -20, Number.NaN, Infinity])
      expect(mixedKeyboardCamera(road, height)).toBe(road);
  });
});
