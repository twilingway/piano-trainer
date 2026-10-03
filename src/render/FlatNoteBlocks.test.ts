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
    blocks.draw(100, 0, 40, 0, 0xffffff, 1, Texture.WHITE);
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
    blocks.draw(100, 30, width, height, 0x00ccff, 0.7, Texture.WHITE);
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
    blocks.draw(100, 0, 40, 100, 0xffffff, 1, Texture.WHITE);
    blocks.draw(150, 0, 40, 100, 0xffffff, 1, Texture.WHITE);
    blocks.end();
    const first = blocks.container.children[0];
    blocks.begin();
    blocks.draw(100, 0, 20, 4, 0xffffff, 1, Texture.WHITE);
    blocks.end();
    expect(blocks.container.children).toHaveLength(6);
    expect(blocks.container.children[0]).toBe(first);
    expect(blocks.container.children[3]?.visible).toBe(false);
    expect(blocks.container.children[4]?.visible).toBe(false);
    expect(blocks.container.children[5]?.visible).toBe(false);
  });
});
