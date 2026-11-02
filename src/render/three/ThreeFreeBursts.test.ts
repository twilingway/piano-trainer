import { PerspectiveCamera, Texture } from "three";
import type { Sprite } from "three";
import { describe, expect, it } from "vitest";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import {
  FREE_BURST_MIN_SHARE,
  ThreeFreeBursts,
  freeBurstSize,
  freeLaneStep
} from "./ThreeFreeBursts";

const lane = (pitch: number, x: number) => ({
  pitch,
  width: 23,
  near: { x, y: 22, z: -100 },
  far: { x: x * 2, y: 2022, z: -50000 }
});

function frameWithBurst(age: number): ThreeRoadFrame {
  const frame = new ThreeRoadFrame();
  frame.freeLanes = [lane(60, 0), lane(61, 20), lane(62, 40)];
  frame.bursts[0] = { x: 0, y: 2022, z: -50000, color: 0xff0060, age };
  frame.burstCount = 1;
  return frame;
}

function visible(bursts: ThreeFreeBursts): Sprite[] {
  return bursts.group.children.filter((child): child is Sprite => child.visible);
}

describe("free field bursts", () => {
  it("measures the lane step at the field's far end", () => {
    expect(freeLaneStep([lane(60, 0), lane(61, 20), lane(62, 40)])).toBeCloseTo(40);
    expect(freeLaneStep([lane(60, 0)])).toBe(23);
    expect(freeLaneStep([])).toBe(0);
  });

  it("keeps a far burst at its share of the screen and a near one at five lane steps", () => {
    // At 45° the screen at 50 m is 2·50000·tan(22.5°) ≈ 41.4 m tall.
    const screen = 2 * 50000 * Math.tan(Math.PI / 8);
    expect(freeBurstSize(40, 50000, 45)).toBeCloseTo(screen * FREE_BURST_MIN_SHARE);
    expect(freeBurstSize(40, 100, 45)).toBe(200);
  });

  it("places the burst at the far point in the burst's colour and phase", () => {
    const bursts = new ThreeFreeBursts();
    bursts.setAtlas(new Texture());
    const camera = new PerspectiveCamera(45, 1, 0.1, 100000);
    bursts.update(frameWithBurst(0.1), camera);
    const [sprite] = visible(bursts);
    expect(sprite?.position.toArray()).toEqual([0, 2022, -50000]);
    expect(sprite?.material.color.getHex()).toBe(0xff0060);
    // 0.1 s of a 0.5 s, 15-frame burst is frame 3: column 3 of the top row.
    expect(sprite?.material.map?.offset.x).toBeCloseTo(3 / 5);
    expect(sprite?.material.map?.offset.y).toBeCloseTo(2 / 3);
    const distance = Math.hypot(2022, 50000);
    expect(sprite?.scale.x).toBeCloseTo(freeBurstSize(40, distance, 45));
  });

  it("shows nothing once the burst is over, without a frame or before the atlas loads", () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 100000);
    const loading = new ThreeFreeBursts();
    loading.update(frameWithBurst(0.1), camera);
    expect(visible(loading)).toHaveLength(0);
    const bursts = new ThreeFreeBursts();
    bursts.setAtlas(new Texture());
    bursts.update(frameWithBurst(0.1), camera);
    expect(visible(bursts)).toHaveLength(1);
    bursts.update(frameWithBurst(0.5), camera);
    expect(visible(bursts)).toHaveLength(0);
    bursts.update(frameWithBurst(0.1), camera);
    bursts.update(undefined, camera);
    expect(visible(bursts)).toHaveLength(0);
  });
});
