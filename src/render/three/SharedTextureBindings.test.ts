import { describe, expect, it, vi } from "vitest";
import { SharedTextureBindings } from "./SharedTextureBindings";

describe("shared framebuffer texture handoff", () => {
  it("removes a render target from sampler slots hidden from the Pixi cache", () => {
    const target = {} as WebGLTexture;
    const empty = {} as WebGLTexture;
    const bound = new Map<number, WebGLTexture | null>([
      [100, target],
      [103, target]
    ]);
    let active = 103;
    const gl = {
      MAX_TEXTURE_IMAGE_UNITS: 1,
      TEXTURE0: 100,
      TEXTURE_2D: 2,
      getParameter: vi.fn(() => 4),
      activeTexture: (slot: number) => {
        active = slot;
      },
      bindTexture: (_type: number, texture: WebGLTexture | null) => {
        bound.set(active, texture);
      }
    };
    const bindings = new SharedTextureBindings(gl as unknown as WebGL2RenderingContext);
    bindings.release(empty);
    expect([...bound.values()]).not.toContain(target);
    expect(bound.get(103)).toBe(empty);
    expect(active).toBe(100);
    bound.set(102, target);
    bindings.release(empty);
    expect([...bound.values()]).not.toContain(target);
    expect(gl.getParameter).toHaveBeenCalledOnce();
  });
});
