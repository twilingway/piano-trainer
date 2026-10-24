import { Group, Scene, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import { StageWorldScore } from "./StageWorldScore";
import type { FreeSceneCamera } from "./FreeSceneCamera";
import type { KeysScene } from "../NativeKeyboardScene";
import { DEFAULT_FREE_DIRECT_FIELD, freeRoadLanes } from "../freeRoadLayout";
import { StaffWorldSource } from "../../staff/staffWorldSnapshot";
it("reserves stable score bounds with the piano hidden without reusing key visibility", () => {
  const scene = new Scene(),
    keys = new Group();
  keys.visible = false;
  keys.scale.setScalar(2);
  scene.add(keys);
  const free = { invalidate: vi.fn(), setScoreBounds: vi.fn() };
  const poster = new StageWorldScore(
    { capabilities: { maxTextureSize: 2048 } } as WebGLRenderer,
    scene,
    keys,
    free as unknown as FreeSceneCamera
  );
  const source = new StaffWorldSource();
  source.configure(true, () => 0);
  poster.setSource(source);
  const view = { camera: { params: { orthographicScale: 1 } } } as unknown as KeysScene;
  poster.draw(view, [], true);
  expect(poster.group.parent?.parent).toBe(scene);
  expect(poster.group.visible).toBe(true);
  expect(poster.group.parent).not.toBe(keys);
  const bounds = free.setScoreBounds.mock.lastCall?.[0] as {
    min: { y: number };
    max: { y: number };
  };
  expect(bounds.min.y).toBe(4444);
  expect(bounds.max.y).toBe(5244);
  poster.draw(view, [], true, { freeLayout: { ...DEFAULT_FREE_DIRECT_FIELD, height: 8 } });
  expect(poster.group.position.y).toBe(8422);
  const layout = { ...DEFAULT_FREE_DIRECT_FIELD, height: 2, width: 30, shape: "convex" as const };
  const lanes = freeRoadLanes(
    [60, 61, 62].map((pitch, index) => ({
      pitch,
      near: { x: index * 23.5, y: 22, z: -149.1938 },
      width: 20
    })),
    layout
  );
  const maxTop = Math.max(...lanes.map((lane) => lane.far.y));
  expect(maxTop).toBeGreaterThan(2022);
  const sheet = poster.group.children[0];
  const unchangedTransform = keys.matrixWorld.clone();
  poster.draw(view, [], true, { freeLayout: layout, freeLanes: lanes });
  expect(poster.group.position.y - 200).toBeCloseTo(maxTop + 200);
  expect(poster.group.children[0]).toBe(sheet);
  expect(keys.matrixWorld.equals(unchangedTransform)).toBe(true);
  poster.draw(view, [], false);
  expect(free.setScoreBounds).toHaveBeenLastCalledWith(undefined);
  poster.dispose();
  expect(scene.children).toEqual([keys]);
});
