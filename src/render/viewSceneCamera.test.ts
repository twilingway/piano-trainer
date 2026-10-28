import { expect, it, vi } from "vitest";
import { DEFAULT_FREE_PERSPECTIVE_FIELD } from "./freeRoadLayout";
import type { RoadLayer } from "./RoadLayer";
import { ViewSceneCamera } from "./viewSceneCamera";

it("remembers source layout before road mount and reapplies it without changing camera mode", () => {
  const host: { road?: RoadLayer } = {};
  const changed = vi.fn();
  const camera = new ViewSceneCamera(
    () => host.road,
    () => true,
    changed
  );
  const layout = { ...DEFAULT_FREE_PERSPECTIVE_FIELD, width: 12, shape: "concave" as const };
  camera.setRoadLayout(layout);
  const mounted = {
    setWorldFov: vi.fn(),
    setFreeRoadLayout: vi.fn(),
    setPerformanceScene: vi.fn(),
    setFreeCamera: vi.fn(),
    setFreeCameraMovement: vi.fn()
  };
  host.road = mounted as unknown as RoadLayer;
  camera.apply();
  expect(mounted.setFreeRoadLayout).toHaveBeenLastCalledWith(layout);
  expect(mounted.setFreeCamera).toHaveBeenLastCalledWith(false, expect.any(Function));
  mounted.setFreeCamera.mockClear();
  camera.setRoadLayout({ ...layout, height: 3 });
  expect(mounted.setFreeRoadLayout).toHaveBeenLastCalledWith({ ...layout, height: 3 });
  expect(mounted.setFreeCamera).not.toHaveBeenCalled();
});

it("resets the world pose only on an explicit world reset", () => {
  const road = { setWorldFov: vi.fn(), resetFreeCamera: vi.fn() };
  const camera = new ViewSceneCamera(
    () => road as unknown as RoadLayer,
    () => true,
    vi.fn()
  );
  camera.setWorldFov(70);
  expect(road.setWorldFov).toHaveBeenLastCalledWith(70);
  expect(road.resetFreeCamera).not.toHaveBeenCalled();
  camera.setWorldFov(45, true);
  expect(road.setWorldFov).toHaveBeenLastCalledWith(45);
  expect(road.resetFreeCamera).toHaveBeenCalledOnce();
});
