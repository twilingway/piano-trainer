// @vitest-environment happy-dom
import { Assets, Texture, TextureSource } from "./flatThree";
import type { Sprite } from "./flatThree";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeonRailLayer, neonRailFrame } from "./NeonRailLayer";

afterEach(() => vi.restoreAllMocks());
function atlas() {
  const texture = new Texture({ source: new TextureSource({ width: 4096, height: 192 }) });
  const load = vi.spyOn(Assets, "load").mockResolvedValue(texture);
  return { texture, load };
}

describe("accepted native pre-key neon rail", () => {
  it.each([
    [0, 0],
    [0.25, 1],
    [1, 4],
    [11.75, 47],
    [12, 0],
    [NaN, 0]
  ])("uses existing decorative time %s for frame %s", (time, frame) => {
    expect(neonRailFrame(time)).toBe(frame);
  });
  it("loads one atlas and reuses one sprite and 48 shared-source frames", async () => {
    const { texture, load } = atlas();
    const rail = new NeonRailLayer();
    await Promise.all([rail.load(), rail.load()]);
    expect(load).toHaveBeenCalledOnce();
    expect(rail.container.children).toHaveLength(1);
    const sprite = rail.container.children[0] as Sprite;
    rail.draw(0, 1366, 500, true);
    const first = sprite.texture;
    expect(first.source).toBe(texture.source);
    expect(first.frame).toMatchObject({ x: 0, y: 0, width: 512, height: 32 });
    expect(sprite.position).toMatchObject({ x: 0, y: 500 });
    expect(sprite.anchor).toMatchObject({ x: 0, y: 0.5 });
    expect(sprite.width).toBe(1366);
    expect(sprite.height).toBe(16);
    rail.draw(11.75, 320, 200, true);
    expect(sprite.texture.frame).toMatchObject({ x: 3584, y: 160, width: 512, height: 32 });
    expect(sprite.width).toBe(320);
    rail.draw(12, 667, 200, true);
    expect(sprite.texture).toBe(first);
    expect(rail.container.children[0]).toBe(sprite);
    rail.destroy();
    expect(texture.source.destroyed).toBe(false);
  });
  it("hides invalid or disabled geometry and owns only its frame views", async () => {
    atlas();
    const rail = new NeonRailLayer();
    rail.draw(0, 800, 400, true);
    expect(rail.container.visible).toBe(false);
    await rail.load();
    rail.draw(0, 800, 400, true);
    expect(rail.container.visible).toBe(true);
    const frames = new Set<Texture>();
    for (let index = 0; index < 48; index++) {
      rail.draw(index / 4, 800, 400, true);
      frames.add((rail.container.children[0] as Sprite).texture);
    }
    expect(frames.size).toBe(48);
    rail.draw(0, 800, 400, false);
    expect(rail.container.visible).toBe(false);
    rail.draw(0, NaN, 400, true);
    expect(rail.container.visible).toBe(false);
    rail.draw(0, 800, Infinity, true);
    expect(rail.container.visible).toBe(false);
    rail.destroy();
    rail.destroy();
    expect([...frames].every((frame) => frame.destroyed)).toBe(true);
  });
  it("does not create frame views when destroyed during loading", async () => {
    const { texture, load } = atlas();
    let finish: ((texture: typeof Texture.EMPTY) => void) | undefined;
    load.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const rail = new NeonRailLayer();
    const pending = rail.load();
    rail.destroy();
    finish?.(texture);
    await pending;
    expect(rail.container.destroyed).toBe(true);
    expect(texture.source.destroyed).toBe(false);
  });
});
