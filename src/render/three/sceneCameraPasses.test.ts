import { Camera, Group, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { drawSceneCameraPasses } from "./sceneCameraPasses";

function fixture() {
  const scene = new Scene();
  const road = new Group(),
    keys = new Group(),
    lights = new Group();
  scene.add(road, keys, lights);
  const roadCamera = new Camera(),
    keyboardCamera = new Camera();
  const states: { road: boolean; keys: boolean; lights: boolean; camera: Camera }[] = [];
  const renderer = {
    render: vi.fn((_scene: Scene, camera: Camera) => {
      states.push({ road: road.visible, keys: keys.visible, lights: lights.visible, camera });
    }),
    clearDepth: vi.fn()
  };
  return { scene, road, keys, lights, roadCamera, keyboardCamera, states, renderer };
}

describe("shared scene camera composition", () => {
  it("keeps the ordinary single pass and shared physical lights", () => {
    const f = fixture();
    drawSceneCameraPasses(
      f.renderer,
      f.scene,
      f.road,
      f.keys,
      f.roadCamera,
      f.keyboardCamera,
      false
    );
    expect(f.states).toEqual([{ road: true, keys: true, lights: true, camera: f.roadCamera }]);
    expect(f.renderer.clearDepth).not.toHaveBeenCalled();
  });
  it("draws the road before overhead keys/hands and clears only depth between projections", () => {
    const f = fixture();
    drawSceneCameraPasses(
      f.renderer,
      f.scene,
      f.road,
      f.keys,
      f.roadCamera,
      f.keyboardCamera,
      true
    );
    expect(f.states).toEqual([
      { road: true, keys: false, lights: true, camera: f.roadCamera },
      { road: false, keys: true, lights: true, camera: f.keyboardCamera }
    ]);
    expect(f.renderer.clearDepth).toHaveBeenCalledOnce();
    expect(f.road.visible).toBe(true);
    expect(f.keys.visible).toBe(true);
    expect(f.scene.children).toEqual([f.road, f.keys, f.lights]);
  });
  it.each([1, 2])("restores group visibility when pass %s throws", (failure) => {
    const f = fixture();
    let calls = 0;
    f.renderer.render.mockImplementation(() => {
      if (++calls === failure) throw new Error("GPU failure");
    });
    expect(() => {
      drawSceneCameraPasses(
        f.renderer,
        f.scene,
        f.road,
        f.keys,
        f.roadCamera,
        f.keyboardCamera,
        true
      );
    }).toThrow("GPU failure");
    expect(f.road.visible).toBe(true);
    expect(f.keys.visible).toBe(true);
    expect(f.lights.visible).toBe(true);
  });
  it("preserves initially hidden groups rather than reviving them", () => {
    const f = fixture();
    f.road.visible = false;
    f.keys.visible = false;
    drawSceneCameraPasses(
      f.renderer,
      f.scene,
      f.road,
      f.keys,
      f.roadCamera,
      f.keyboardCamera,
      true
    );
    expect(f.road.visible).toBe(false);
    expect(f.keys.visible).toBe(false);
  });
});
