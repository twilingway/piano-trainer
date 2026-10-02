import { describe, expect, it } from "vitest";
import {
  legacyKeyboardPoint,
  legacyRoadProjection,
  LEGACY_KEYS_SQUASH
} from "./legacyKeyboardGeometry";

describe("original keyboard compatibility", () => {
  it.each([
    [390, 844, -80],
    [667, 375, 44],
    [1920, 1080, 300]
  ])("keeps original 44px hit edges and pointer inverse at %s", (width, bottom, pan) => {
    const flatHitY = bottom - 180;
    const legacy = legacyRoadProjection(width, flatHitY, bottom, { far: 0.1, horizon: 0.1 });
    const left = legacy.projection.at(100 - pan, 1),
      right = legacy.projection.at(144 - pan, 1);
    expect(right.x - left.x).toBeCloseTo(44);
    expect(legacy.hitY).toBe(bottom - 180 * 0.9);
    expect(
      legacyKeyboardPoint(left.x, legacy.hitY + 50 * LEGACY_KEYS_SQUASH, pan, legacy.hitY, flatHitY)
    ).toEqual({ x: 100, y: flatHitY + 50 });
    expect(legacyKeyboardPoint(100, legacy.hitY - 1, pan, legacy.hitY, flatHitY)).toBeUndefined();
  });
  it("retains the original road width and horizon controls", () => {
    const initial = legacyRoadProjection(1000, 500, 700, { far: 0.1, horizon: 0.1 });
    const changed = legacyRoadProjection(1000, 500, 700, { far: 0.8, horizon: 0.4 });
    expect(changed.projection.at(0, 0).x).toBeLessThan(initial.projection.at(0, 0).x);
    expect(changed.horizonY).toBeGreaterThan(initial.horizonY);
  });
});
