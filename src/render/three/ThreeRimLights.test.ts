import { Group, RectAreaLight, Vector3 } from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import type { Texture } from "../flatThree";
import { describe, expect, it, vi } from "vitest";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../NativeKeyboardScene";
import { DEFAULT_CAMERA, PANEL_EDGE, worldCamera } from "../worldCamera";
import { keyBoxes } from "./keyBoxes";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import { RIM_LIGHT_LIMIT, ThreeRimLights } from "./ThreeRimLights";

function scene(first = 21, last = 108, width = 1800, scale = 1): KeysScene {
  return {
    faces: [...layoutKeyboard(width, first, last).values()].map((key) => ({
      key,
      source: key.black ? { y: 0, height: 60 } : { y: 60, height: 40 }
    })),
    texture: { width, height: 100 } as Texture,
    camera: worldCamera(1280, 640, { ...DEFAULT_CAMERA, scale }, PANEL_EDGE),
    pan: 175,
    offset: { x: 17, y: 11 },
    version: 1
  };
}

describe("neutral rim lighting", () => {
  it("initializes shared LTC textures only once across construction and disposal", () => {
    const initialize = vi.spyOn(RectAreaLightUniformsLib, "init");
    const first = new ThreeRimLights();
    expect(initialize).toHaveBeenCalledOnce();
    first.dispose();
    const second = new ThreeRimLights();
    expect(initialize).toHaveBeenCalledOnce();
    second.dispose();
    initialize.mockRestore();
  });

  it.each([
    [21, 108],
    [36, 84]
  ])(
    "spans keys %s..%s with a single narrow area emitter aimed down and forward",
    (first, last) => {
      const pool = new ThreeRimLights();
      const boxes = keyBoxes(scene(first, last));
      const left = Math.min(...boxes.map((box) => box.x - box.width / 2));
      const right = Math.max(...boxes.map((box) => box.x + box.width / 2));
      pool.layout(boxes, 1);
      expect(pool.group.children).toHaveLength(RIM_LIGHT_LIMIT);
      const light = pool.group.children[0] as RectAreaLight;
      expect(light).toBeInstanceOf(RectAreaLight);
      expect(light.castShadow).toBe(false);
      expect(light.position.x).toBeCloseTo((left + right) / 2);
      expect(light.position.y).toBe(58);
      expect(light.position.z).toBe(-142);
      expect(light.width).toBeCloseTo(right - left);
      expect(light.height).toBe(14);
      expect(light.intensity).toBe(5.5);
      const direction = new Vector3(0, 0, -1).applyQuaternion(light.quaternion);
      const target = new Vector3(light.position.x, 22, -52).sub(light.position).normalize();
      expect(direction.distanceTo(target)).toBeLessThan(1e-10);
      expect(direction.y).toBeLessThan(0);
      expect(direction.z).toBeGreaterThan(0);
      expect(new Vector3(1, 0, 0).applyQuaternion(light.quaternion).x).toBeCloseTo(1);
      expect(light.color.r).toBeGreaterThan(0.7);
      expect(Math.abs(light.color.b - light.color.r)).toBeLessThan(0.06);
      pool.dispose();
    }
  );

  it("follows pan and scale with a matching aperture and constant radiance", () => {
    const pool = new ThreeRimLights();
    const keys = scene(21, 108, 1800, 1.5);
    const boxes = keyBoxes(keys);
    pool.layout(boxes, 1);
    const first = pool.group.children[0] as RectAreaLight;
    const baseIntensity = first.intensity;
    const baseWidth = first.width;
    const resources = [...pool.group.children];
    pool.layout(boxes, 1.5);
    expect(pool.group.children).toEqual(resources);
    expect(first.intensity).toBe(baseIntensity);
    expect(first.width).toBeCloseTo(baseWidth * 1.5);
    expect(first.height).toBe(21);
    const { camera, pan, offset } = keys;
    const position = first.position;
    const projected = new Vector3((position.x - pan / 2) * 1.5, position.y * 1.5, position.z * 1.5)
      .applyMatrix4(viewMatrix(camera.params))
      .applyMatrix4(projectionMatrix(camera.params, 1280, 720, offset));
    const expected = camera.project(position.x - pan / 2, position.y, -position.z);
    expect((projected.x + 1) * 640).toBeCloseTo(expected.x + offset.x);
    expect((1 - projected.y) * 360).toBeCloseTo(expected.y + offset.y);
    pool.dispose();
  });

  it("keeps radiance on narrow layouts, disables empty ones, and disposes only its own group", () => {
    const pool = new ThreeRimLights();
    const parent = new Group();
    parent.add(pool.group);
    pool.layout(keyBoxes(scene(48, 72, 600)), 1);
    const lights = pool.group.children as RectAreaLight[];
    expect(lights[0]?.intensity).toBe(5.5);
    expect(lights[0]?.width).toBeCloseTo(300);
    pool.layout([], 1);
    expect(lights.every((light) => light.intensity === 0)).toBe(true);
    pool.dispose();
    expect(parent.children).toHaveLength(0);
    expect(pool.group.children).toHaveLength(0);
  });
});
