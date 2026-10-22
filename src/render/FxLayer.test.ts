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
    expect(glitter.children).toHaveLength(1);
    fx.draw([], [key], 400, 0.13);
    expect(glitter.children).toHaveLength(2);
    fx.clear();
    expect(glitter.children.every((sprite) => !sprite.visible)).toBe(true);
  });
});

describe("note-coloured light without additive clipping", () => {
  it.each([0x00df50, 0xff9400, 0xc528f5])(
    "keeps burst, halo and hot core in the note hue %s",
    async (color) => {
      const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
      vi.spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
      const fx = new FxLayer();
      await fx.load();
      const key = { pitch: 60, x: 100, width: 40, color };
      fx.draw([key], [key], 400, 0.05);
      const halos = fx.container.children[1] as Container;
      const hit = fx.container.children[2] as Container;
      for (const sprite of [...halos.children, ...hit.children] as Sprite[]) {
        expect(sprite.visible).toBe(true);
        expect(sprite.tint).toBe(color);
        expect(sprite.blendMode).toBe("normal");
      }
      expect(halos.children).toHaveLength(2);
      expect(hit.children).toHaveLength(1);
    }
  );
});
