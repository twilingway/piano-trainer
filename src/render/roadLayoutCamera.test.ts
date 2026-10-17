import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS, KEYS_BACK } from "./worldCamera";
import { roadLayoutCamera } from "./roadLayoutCamera";

describe("road layout camera inputs", () => {
  it("fits a wide native overhead keyboard uniformly and keeps the horizon and key contact", () => {
    const viewWidth = 1200;
    const sceneWidth = 2288;
    const camera = roadLayoutCamera(viewWidth, sceneWidth, 700, CAMERA_PRESETS.top, true, 0.1);
    const pan = (sceneWidth - viewWidth) / 2;
    const left = camera.project(camera.sourceX(0 - pan), KEYS_BACK.y, KEYS_BACK.z);
    const right = camera.project(camera.sourceX(sceneWidth - pan), KEYS_BACK.y, KEYS_BACK.z);
    expect(camera.near).toEqual(KEYS_BACK);
    expect(left.x).toBeCloseTo(12);
    expect(right.x).toBeCloseTo(viewWidth - 12);
    const hit = camera.road.at(viewWidth / 2, 1);
    expect(camera.road.at(viewWidth / 2, 0).y).toBeCloseTo(hit.y * 0.1);
    expect(left.y).toBeCloseTo(right.y);
  });

  it("keeps the legacy key surface and road depth independent of native horizon fitting", () => {
    const camera = roadLayoutCamera(1200, 2288, 700, CAMERA_PRESETS.hands, false, 0.35);
    expect(camera.near).toEqual(KEYS_BACK);
    expect(camera.roadFarZ).toBeCloseTo(KEYS_BACK.z + 1500 * (700 / 375));
    expect(camera.params.prefs).toEqual(CAMERA_PRESETS.hands);
    expect(camera.params.width).toBe(1200);
  });

  it("bounds a layout with no remaining room before constructing its camera", () => {
    const camera = roadLayoutCamera(800, 800, -20, CAMERA_PRESETS.player, true, 0.1);
    const hit = camera.road.at(400, 1);
    expect(Number.isFinite(hit.x)).toBe(true);
    expect(Number.isFinite(hit.y)).toBe(true);
    expect(camera.params.fit).toBe(1);
  });
});

it("joins the native road to the actual white rear without a raised case gap", () => {
  for (const prefs of [CAMERA_PRESETS.player, CAMERA_PRESETS.top, CAMERA_PRESETS.hands]) {
    const camera = roadLayoutCamera(1440, 2288, 700, prefs, true, 0.1);
    const hit = camera.road.at(720, 1);
    const rear = camera.project(0, 22, 142);
    expect(hit.y).toBeCloseTo(rear.y, 10);
    expect(hit.x).toBeCloseTo(rear.x, 10);
  }
});
