// @vitest-environment happy-dom
import { Texture } from "pixi.js";
import type { NineSliceSprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlatNoteBlocks } from "./FlatNoteBlocks";

afterEach(() => vi.restoreAllMocks());

describe("flat neon blocks", () => {
  it("skips a collapsed lane without allocating invalid geometry", () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const blocks = new FlatNoteBlocks();
    blocks.begin();
    blocks.draw(100, 0, 40, 0, 0xffffff, 1);
    blocks.end();
    expect(blocks.container.children).toHaveLength(0);
  });
  it.each([
    [70, 150],
    [22, 90],
    [8, 4]
  ])("preserves visible dimensions for a %s px key and %s px hold", (width, height) => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const blocks = new FlatNoteBlocks();
    blocks.begin();
    blocks.draw(100, 30, width, height, 0x00ccff, 0.7);
    const fill = blocks.container.children[0] as NineSliceSprite;
    expect(fill.width * fill.scale.x).toBeCloseTo(width);
    expect(fill.height * fill.scale.y).toBeCloseTo(height);
    expect(fill.x + width / 2).toBe(100);
    expect(fill.y).toBe(30);
    expect(fill.tint).toBe(0x00ccff);
    expect(fill.alpha).toBe(0.7);
  });

  it("reuses the pool and hides a consumed note on the next frame", () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const blocks = new FlatNoteBlocks();
    blocks.begin();
    blocks.draw(100, 0, 40, 100, 0xffffff, 1);
    blocks.draw(150, 0, 40, 100, 0xffffff, 1);
    blocks.end();
    const first = blocks.container.children[0];
    blocks.begin();
    blocks.draw(100, 0, 20, 4, 0xffffff, 1);
    blocks.end();
    expect(blocks.container.children).toHaveLength(10);
    expect(blocks.container.children[0]).toBe(first);
    for (const child of blocks.container.children.slice(5)) expect(child.visible).toBe(false);
  });

  it("keeps a short note's bloom radius and draws every halo below the faces", () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const blocks = new FlatNoteBlocks();
    blocks.begin();
    blocks.draw(100, 30, 36, 150, 0x00ccff, 1);
    const bloom = blocks.container.children.find((child) => child.zIndex === 0) as NineSliceSprite;
    const longWidth = bloom.width * bloom.scale.x;
    const longX = bloom.x;
    blocks.begin();
    blocks.draw(100, 30, 36, 4, 0x00ccff, 1);
    blocks.draw(138, 30, 36, 80, 0xff780a, 1);
    blocks.end();
    expect(bloom.width * bloom.scale.x).toBeCloseTo(longWidth);
    expect(bloom.x).toBeCloseTo(longX);
    blocks.container.sortChildren();
    const layers = blocks.container.children.map((child) => child.zIndex);
    expect(layers.lastIndexOf(0)).toBeLessThan(layers.indexOf(1));
    expect(layers.lastIndexOf(1)).toBeLessThan(layers.indexOf(2));
  });

  it("raises a black key's note above its white neighbour on an opaque plate", () => {
    vi.spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    const blocks = new FlatNoteBlocks();
    blocks.begin();
    blocks.draw(120, 30, 22, 80, 0x00ccff, 1, true);
    blocks.draw(138, 30, 36, 80, 0xffe040, 1);
    blocks.end();
    const [black, white] = [0, 5].map((first) =>
      blocks.container.children.slice(first, first + 5)
    ) as [NineSliceSprite[], NineSliceSprite[]];
    const plate = black[4];
    const flatFaces = white.filter((child) => child.visible).map((child) => child.zIndex);
    const plateAndGlass = black.filter((child) => child.zIndex !== 0).map((child) => child.zIndex);
    expect(Math.min(...plateAndGlass)).toBeGreaterThan(Math.max(...flatFaces));
    expect(plate?.visible).toBe(true);
    expect(plate?.blendMode).toBe("normal");
    expect(plate?.alpha).toBe(1);
    expect((plate?.width ?? 0) * (plate?.scale.x ?? 0)).toBeGreaterThan(22);
    expect(white[4]?.visible).toBe(false);
  });
});
