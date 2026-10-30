import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets, Sprite, Texture, TextureSource } from "./flatThree";
import { HorizonBurstLayer } from "./HorizonBurstLayer";
import type { RoadProjection } from "./perspective";
import type { Arrival } from "./RoadLayer";

const projection: RoadProjection = {
  progressAt: (depth) => depth,
  depthAt: (progress) => progress,
  at: (x) => ({ x: 500 + x * 0.01, y: 80, scale: 0.01 })
};
const arrival: Arrival = { x: 40, width: 1, age: 0.1, color: 0xff0060 };

async function loaded(): Promise<HorizonBurstLayer> {
  const atlas = new Texture({ source: new TextureSource({ width: 800, height: 480 }) });
  vi.spyOn(Assets, "load").mockResolvedValue(atlas);
  const layer = new HorizonBurstLayer();
  await layer.load();
  return layer;
}

function sprites(layer: HorizonBurstLayer): Sprite[] {
  return layer.container.children.filter(
    (child): child is Sprite => child instanceof Sprite && child.visible
  );
}

afterEach(() => vi.restoreAllMocks());

describe("flat horizon bursts", () => {
  it("keeps the flash large even at a vanishing point, with a bounded size on wide lanes", async () => {
    const layer = await loaded();
    for (const [width, expected] of [
      [1, 160],
      [40, 200],
      [100, 240]
    ] as const) {
      layer.draw([{ ...arrival, width }], projection, 0);
      expect(sprites(layer)[0]?.width).toBe(expected);
    }
    layer.destroy();
  });

  it("brightens the background in the finger colour at the note's exact source", async () => {
    const layer = await loaded();
    layer.draw([{ ...arrival, screenX: 321, screenY: 123 }], projection, 10);
    const sprite = sprites(layer)[0];
    expect(sprite?.position.x).toBe(321);
    expect(sprite?.position.y).toBe(123);
    expect(sprite?.tint).toBe(0xff0060);
    expect(sprite?.blendMode).toBe("screen");
    expect(sprite?.texture.frame.x).toBe(480);
    layer.draw([arrival], projection, 10);
    expect(sprite?.position.x).toBeCloseTo(500.3);
    expect(sprite?.position.y).toBe(80);
    layer.destroy();
  });

  it("reuses sprites on pause and rewind, and hides them after seek or empty data", async () => {
    const layer = await loaded();
    layer.draw([arrival], projection, 0);
    const sprite = sprites(layer)[0];
    const texture = sprite?.texture;
    layer.draw([arrival], projection, 0);
    expect(sprites(layer)[0]).toBe(sprite);
    expect(sprite?.texture).toBe(texture);
    layer.draw([{ ...arrival, age: 0.5 }], projection, 0);
    expect(sprites(layer)).toHaveLength(0);
    layer.draw([{ ...arrival, age: 0 }], projection, 0);
    expect(sprites(layer)[0]).toBe(sprite);
    expect(sprite?.texture.frame.x).toBe(0);
    layer.draw([], projection, 0);
    expect(sprites(layer)).toHaveLength(0);
    layer.destroy();
  });

  it("does not draw before loading or when the atlas fails", async () => {
    const layer = new HorizonBurstLayer();
    layer.draw([arrival], projection, 0);
    expect(sprites(layer)).toHaveLength(0);
    vi.spyOn(Assets, "load").mockRejectedValue(new Error("offline"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await layer.load();
    expect(layer.ready).toBe(false);
    layer.draw([arrival], projection, 0);
    expect(sprites(layer)).toHaveLength(0);
    expect(warning).toHaveBeenCalledOnce();
    layer.destroy();
  });

  it("bounds the sprite pool for a chord and skips invalid or unborn phases", async () => {
    const layer = await loaded();
    layer.draw(
      Array.from({ length: 40 }, () => arrival),
      projection,
      0
    );
    expect(sprites(layer)).toHaveLength(32);
    layer.draw(
      [
        { ...arrival, age: -0.01 },
        { ...arrival, age: Number.NaN }
      ],
      projection,
      0
    );
    expect(sprites(layer)).toHaveLength(0);
    expect(layer.container.children).toHaveLength(32);
    layer.destroy();
  });
});
