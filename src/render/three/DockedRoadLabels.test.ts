// @vitest-environment happy-dom
import { Camera, Group } from "three";
import { expect, it, vi } from "vitest";
import type { WorldCamera } from "../worldCamera";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { DockedRoadLabels } from "./DockedRoadLabels";

it("replaces legacy labels only while docked and returns ownership on exit", () => {
  const labels = new DockedRoadLabels();
  const frame = new ThreeRoadFrame();
  const legacy = { renderable: true };
  frame.legacyLabels = [legacy];
  const camera = new Camera();
  const world = { near: { z: 100 }, roadFarZ: 2000 } as WorldCamera;
  const road = new Group();
  const screen = { width: 1000, height: 700 };
  labels.prepare(frame, world, road, camera, camera, screen, true);
  expect(legacy.renderable).toBe(false);
  labels.prepare(frame, world, road, camera, camera, screen, false);
  expect(legacy.renderable).toBe(true);
  const renderer = { clearDepth: vi.fn(), render: vi.fn() };
  labels.draw(renderer as unknown as Parameters<typeof labels.draw>[0]);
  expect(renderer.render).not.toHaveBeenCalled();
  labels.dispose();
});
