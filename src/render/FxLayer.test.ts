// @vitest-environment happy-dom
import { Assets, Texture, TextureSource } from "pixi.js";
import type { Container, Sprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FxLayer } from "./FxLayer";

afterEach(() => vi.restoreAllMocks());

describe("burning after the strike", () => {
  it("starts enlarged fire within 50 ms and skips the atlas buildup frames", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    // Assets.load's last overload returns a bundle, though the layer loads individual textures.
    vi.spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fx = new FxLayer();
    await fx.load();
    const key = { pitch: 60, x: 100, width: 40, color: 0x00d9ff };
    const glitter = fx.container.children[0] as Container;
    fx.draw([key], [key], 400, 0.016);
    expect(glitter.children).toHaveLength(0);
    fx.draw([], [key], 400, 0.016);
    fx.draw([], [key], 400, 0.016);
    const puff = glitter.children[0] as Sprite;
    expect(puff.visible).toBe(true);
    expect(puff.width).toBeCloseTo(40 * 5.4);
    expect(puff.texture.frame.x).toBe(144 * 2);
    fx.draw([], [key], 400, 0.08);
    expect(glitter.children).toHaveLength(2);
    fx.clear();
    expect(glitter.children.every((sprite) => !sprite.visible)).toBe(true);
  });
});
