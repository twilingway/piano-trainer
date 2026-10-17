import { describe, expect, it } from "vitest";
import { nativeRoadCamera } from "./nativeRoadCamera";
import { DEFAULT_CAMERA } from "./worldCamera";

describe("native direct projection", () => {
  it("uses a stable overhead camera and preserves saved perspective framing", () => {
    const saved = { ...DEFAULT_CAMERA, pitch: 40, scale: 1.1, targetY: -125 };
    const before = { ...saved };
    const direct = nativeRoadCamera(saved, true);
    expect(direct.pitch).toBe(90);
    expect(direct.scale).toBe(saved.scale);
    expect(direct.targetY).toBe(saved.targetY);
    expect(nativeRoadCamera(saved, true)).toBe(direct);
    expect(nativeRoadCamera(saved, false)).toBe(saved);
    expect(saved).toEqual(before);
  });
});
