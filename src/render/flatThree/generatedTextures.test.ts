import { describe, expect, it, vi } from "vitest";
import { Renderer } from "./renderer";
import { Graphics } from "./baking";
import type { RenderTexture } from "./textures";

describe("retained generated textures", () => {
  it("keeps generated pixels after temporary baking nodes and framebuffer are disposed", () => {
    let temporary: RenderTexture | undefined;
    const render = vi.fn((options: { target: RenderTexture }) => {
      temporary = options.target;
    });
    const readRenderTargetPixels = vi.fn(
      (_target: unknown, _x: number, _y: number, _w: number, _h: number, pixels: Uint8Array) => {
        for (let i = 0; i < pixels.length; i += 4) pixels.set([128, 32, 0, 128], i);
      }
    );
    const renderer = {
      resolution: 2,
      render,
      threeRenderer: { readRenderTargetPixels }
    } as unknown as Renderer;
    const source = new Graphics().rect(-2, -3, 10, 12).fill(0xff0000);
    const texture = Renderer.prototype.generateTexture.call(renderer, {
      target: source,
      resolution: 3
    });
    source.destroy();
    expect(temporary?.destroyed).toBe(true);
    expect(texture.destroyed).toBe(false);
    expect(texture.nativeTexture.isRenderTargetTexture).toBe(false);
    expect([texture.width, texture.height, texture.source.resolution]).toEqual([10, 12, 3]);
    expect(texture.source.resource).toBeInstanceOf(Uint8Array);
    const pixels = texture.source.resource as Uint8Array;
    expect(pixels.byteLength).toBe(30 * 36 * 4);
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 64, 0, 128]);
    expect(texture.frame).toMatchObject({ x: 0, y: 0, width: 10, height: 12 });
    texture.destroy(true);
  });
  it("disposes temporary framebuffer even when a GPU readback fails", () => {
    let temporary: RenderTexture | undefined;
    const renderer = {
      resolution: 1,
      render: (options: { target: RenderTexture }) => {
        temporary = options.target;
      },
      threeRenderer: {
        readRenderTargetPixels: () => {
          throw new Error("readback refused");
        }
      }
    } as unknown as Renderer;
    const source = new Graphics().rect(0, 0, 4, 4).fill(0xffffff);
    expect(() => Renderer.prototype.generateTexture.call(renderer, { target: source })).toThrow(
      "readback refused"
    );
    expect(temporary?.destroyed).toBe(true);
    source.destroy();
  });
});
