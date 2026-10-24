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
    setFreeRoadLayout: vi.fn(),
    setPerformanceScene: vi.fn(),
    setFreeCamera: vi.fn(),
    setFreeCameraMovement: vi.fn()
  };
  host.road = mounted as unknown as RoadLayer;
  camera.apply();
  expect(mounted.setFreeRoadLayout).toHaveBeenLastCalledWith(layout);
  expect(mounted.setFreeCamera).toHaveBeenLastCalledWith(false, changed);
  mounted.setFreeCamera.mockClear();
  camera.setRoadLayout({ ...layout, height: 3 });
  expect(mounted.setFreeRoadLayout).toHaveBeenLastCalledWith({ ...layout, height: 3 });
  expect(mounted.setFreeCamera).not.toHaveBeenCalled();
});
