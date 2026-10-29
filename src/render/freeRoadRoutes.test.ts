import { describe, expect, it } from "vitest";
import { FreeRoadRoutes } from "./freeRoadRoutes";
import { DEFAULT_FREE_DIRECT_FIELD } from "./freeRoadLayout";
import { layoutKeyboard } from "./keyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { CAMERA_PRESETS } from "./worldCamera";
import { nativeKeyContactOffsetX } from "./nativeKeyContactAnchors";
import { freeRoadBounds } from "./three/freeRoadBounds";

describe("structural selected-key road routes", () => {
  it("keeps every physical contact and caches the whole field without any song input", () => {
    const keys = layoutKeyboard(1280, 60, 72),
      camera = metricKeyboardCamera(1280, 1280, 720, CAMERA_PRESETS.top, 0.1, keys.values());
    const routes = new FreeRoadRoutes();
    routes.update(keys, camera, DEFAULT_FREE_DIRECT_FIELD);
    expect(routes.lanes).toHaveLength(13);
    for (const key of keys.values()) {
      const lane = routes.lanes.find((l) => l.pitch === key.pitch);
      expect(lane?.near.x).toBeCloseTo(
        camera.sourceX(key.x + key.width / 2) + nativeKeyContactOffsetX(key.pitch),
        8
      );
      expect(lane?.near.y).toBe(key.black ? 34 : 22);
      expect(lane?.near.z).toBe(key.black ? -145.8 : -149.1938);
      expect(routes.contacts.get(key.x + key.width / 2)?.freeFar).toBe(lane?.far);
    }
    const previous = routes.lanes;
    routes.update(keys, camera, DEFAULT_FREE_DIRECT_FIELD);
    expect(routes.lanes).toBe(previous);
    routes.update(keys, camera, {
      ...DEFAULT_FREE_DIRECT_FIELD,
      tilt: 21.8,
      length: 21.54,
      width: 30
    });
    expect(routes.lanes).not.toBe(previous);
    const bounds = freeRoadBounds(routes.lanes);
    expect(bounds.max.y).toBeGreaterThan(8022);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(30000);
    expect(bounds.min.z).toBeLessThan(-20149);
  });
});
