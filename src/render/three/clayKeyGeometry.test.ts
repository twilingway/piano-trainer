import { describe, expect, it, vi } from "vitest";
import { MeshStandardMaterial } from "three";
import { isBlackKey } from "../../fingering/fingering";
import {
  KEYBOARD_BLACK_BACK,
  KEYBOARD_BLACK_FRONT,
  KEYBOARD_BLACK_WIDTH,
  KEYBOARD_DEPTH,
  KEYBOARD_WHITE_WIDTH,
  metricKeyX
} from "../keyboardMetrics";
import { clayKeyGeometry } from "./clayKeyGeometry";
import { ClayKeyMaterials } from "./ClayKeyMaterials";
import type { KeyBox } from "./keyBoxes";
const box = (pitch: number): KeyBox => {
  const black = isBlackKey(pitch);
  return {
    pitch,
    black,
    x: metricKeyX(pitch),
    width: black ? KEYBOARD_BLACK_WIDTH : 23.5,
    bottom: black ? 22 : 0,
    top: black ? 34 : 22,
    front: black ? KEYBOARD_BLACK_FRONT : 0,
    back: black ? KEYBOARD_BLACK_BACK : KEYBOARD_DEPTH,
    uv: { u0: 0.2, u1: 0.3, v0: 0, v1: 1 }
  };
};
describe("authored clay keyboard geometry", () => {
  it("keeps all 88 centres, top contacts and metric envelopes with a bounded mobile mesh budget", () => {
    let black = 0,
      vertices = 0;
    for (let pitch = 21; pitch <= 108; pitch++) {
      const key = box(pitch),
        geometry = clayKeyGeometry(key),
        bounds = geometry.boundingBox;
      if (!bounds) throw new Error("Missing bounds");
      expect(bounds.max.y + 22).toBeCloseTo(key.top, 4);
      expect(bounds.min.y + 22).toBeCloseTo(key.bottom, 4);
      expect(bounds.max.z).toBeCloseTo(-key.front, 4);
      expect(bounds.min.z).toBeCloseTo(-key.back, 4);
      const half = (key.black ? KEYBOARD_BLACK_WIDTH : KEYBOARD_WHITE_WIDTH) / 2;
      expect(bounds.min.x).toBeCloseTo(-half, 4);
      expect(bounds.max.x).toBeCloseTo(half, 4);
      const positions = geometry.getAttribute("position");
      vertices += positions.count;
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute("keyPaintUv").count).toBe(positions.count);
      expect(
        geometry.groups.every((group) => group.materialIndex === 0 || group.materialIndex === 1)
      ).toBe(true);
      expect(geometry.groups.reduce((total, group) => total + group.count, 0)).toBe(
        positions.count
      );
      expect(geometry.groups.some((group) => group.materialIndex === 0)).toBe(true);
      if (key.black) black++;
      geometry.dispose();
    }
    expect(black).toBe(36);
    expect(vertices).toBeLessThan(100000);
    for (let c = 24; c <= 96; c += 12) {
      const blacks = Array.from({ length: 12 }, (_, i) => c + i).filter(isBlackKey);
      expect(blacks.map((p) => p - c)).toEqual([1, 3, 6, 8, 10]);
    }
  });
  it("cuts white shoulders clear of their neighbouring black keys while keeping E/F and B/C gaps", () => {
    for (const pitch of [60, 62, 64, 65, 67, 69, 71]) {
      const geometry = clayKeyGeometry(box(pitch)),
        p = geometry.getAttribute("position");
      const back = Array.from({ length: p.count }, (_, i) => i).filter((i) => p.getZ(i) < -100);
      const left = Math.min(...back.map((i) => p.getX(i))),
        right = Math.max(...back.map((i) => p.getX(i)));
      if (isBlackKey(pitch - 1))
        expect(left).toBeGreaterThan(
          metricKeyX(pitch - 1) - metricKeyX(pitch) + KEYBOARD_BLACK_WIDTH / 2
        );
      else expect(left).toBeCloseTo(-KEYBOARD_WHITE_WIDTH / 2, 4);
      if (isBlackKey(pitch + 1))
        expect(right).toBeLessThan(
          metricKeyX(pitch + 1) - metricKeyX(pitch) - KEYBOARD_BLACK_WIDTH / 2
        );
      else expect(right).toBeCloseTo(KEYBOARD_WHITE_WIDTH / 2, 4);
      geometry.dispose();
    }
  });
  it("bakes deterministic matte relief once and frees only its owned materials and map once", () => {
    const one = new ClayKeyMaterials(),
      two = new ClayKeyMaterials();
    expect(one.relief.image.data).toEqual(two.relief.image.data);
    expect(one.relief.image.width).toBe(64);
    for (const m of [one.white, one.black, one.case]) {
      expect(m).toBeInstanceOf(MeshStandardMaterial);
      expect(m.roughness).toBeGreaterThan(0.9);
      expect(m.metalness).toBe(0);
      expect(m.bumpMap).toBe(one.relief);
    }
    const spies = [one.white, one.black, one.case, one.relief].map((value) =>
      vi.spyOn(value, "dispose")
    );
    one.dispose();
    one.dispose();
    expect(spies.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    two.dispose();
  });
});
