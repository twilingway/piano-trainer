// @vitest-environment happy-dom
import { Assets, Texture, TextureSource } from "./flatThree";
import type { Container, Sprite } from "./flatThree";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FxLayer } from "./FxLayer";

function effectGroup(fx: FxLayer, index: number): Container {
  const group = fx.container.children[index];
  if (!group) throw new Error(`Expected effect group ${String(index)}`);
  return group;
}

afterEach(() => vi.restoreAllMocks());

describe("burning after the strike", () => {
  it("starts enlarged fire within 50 ms and skips the atlas buildup frames", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    // Assets.load's last overload returns a bundle, though the layer loads individual textures.
    vi.spyOn(Assets, "load").mockResolvedValue(atlas);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const fx = new FxLayer();
    await fx.load();
    const key = { pitch: 60, x: 100, width: 40, color: 0x00d9ff };
    const glitter = effectGroup(fx, 0);
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
      vi.spyOn(Assets, "load").mockResolvedValue(atlas);
      const fx = new FxLayer();
      await fx.load();
      const key = { pitch: 60, x: 100, width: 40, color };
      fx.draw([key], [key], 400, 0.05);
      const halos = effectGroup(fx, 1);
      const hit = effectGroup(fx, 2);
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

it.each([
  { burning: true, presses: true },
  { burning: false, presses: true },
  { burning: true, presses: false },
  { burning: false, presses: false }
])("independently disables ongoing fire and press effects: %j", async (options) => {
  const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
  vi.spyOn(Assets, "load").mockResolvedValue(atlas);
  const fx = new FxLayer();
  await fx.load();
  const key = { pitch: 60, x: 100, width: 40, color: 0x00d9ff };
  fx.draw([key], [key], 400, 0.05);
  expect(effectGroup(fx, 0).children.some((sprite) => sprite.visible)).toBe(true);
  fx.draw([key], [key], 400, 0.05, options);
  expect(effectGroup(fx, 0).children.some((sprite) => sprite.visible)).toBe(options.burning);
  expect(effectGroup(fx, 1).children.some((sprite) => sprite.visible)).toBe(options.presses);
  expect(effectGroup(fx, 2).children.some((sprite) => sprite.visible)).toBe(options.presses);
});
