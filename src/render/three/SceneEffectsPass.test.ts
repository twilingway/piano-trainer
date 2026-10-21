// @vitest-environment happy-dom
import { Container, GlRenderTargetSystem, RenderTarget, RendererType } from "pixi.js";
import type { Renderer, RenderOptions, WebGLRenderer } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { MistBoundsMask } from "../MistBoundsMask";
import { SceneEffectsPass } from "./SceneEffectsPass";

function sharedRenderer() {
  let clearColor = [0, 0, 0, 1];
  const clears: number[][] = [];
  const gl = {
    COLOR_BUFFER_BIT: 16384,
    clearColor: vi.fn((red: number, green: number, blue: number, alpha: number) => {
      clearColor = [red, green, blue, alpha];
    }),
    clear: vi.fn(() => clears.push([...clearColor]))
  };
  const renderer = {
    type: RendererType.WEBGL,
    gl,
    gc: { addCollection: vi.fn() },
    runners: { contextChange: { add: vi.fn() } },
    state: { depthMaskEnabled: true },
    render: vi.fn<(options: RenderOptions) => void>()
  };
  const renderTarget = new GlRenderTargetSystem(renderer as unknown as WebGLRenderer);
  const target = new RenderTarget({ width: 1, height: 1 });
  return { renderer, gl, clears, renderTarget, target };
}

describe("SceneEffectsPass shared WebGL alpha masks", () => {
  it("clears mask intermediates transparently after Three without clearing the shared frame", () => {
    const { renderer, gl, clears, renderTarget, target } = sharedRenderer();
    // Exercise the installed Pixi adaptor, including its stale clear-color cache after reset.
    renderTarget.resetState();
    renderTarget.adaptor.clear(target, true);
    expect(clears).toEqual([[0, 0, 0, 1]]);
    clears.length = 0;

    const mist = new Container();
    const mask = new MistBoundsMask(mist);
    mask.update([{ pitch: 60, x: 100, y: 300, width: 30, color: 0xffffff }], 400, true);
    const spriteMask = mist.mask;
    expect(spriteMask).toBeTruthy();
    const pass = new SceneEffectsPass();
    pass.setLayers([mist]);
    renderer.render.mockImplementation((options) => {
      // Root clear:false must preserve the road. AlphaMaskPipe's FilterSystem then clears
      // its input target with the adaptor's default transparent color and composites it.
      const before = clears.length;
      renderTarget.adaptor.clear(target, options.clear ?? true);
      expect(clears).toHaveLength(before);
      renderTarget.adaptor.clear(target, true);
      expect(clears[before]).toEqual([0, 0, 0, 0]);
    });

    for (let frame = 0; frame < 2; frame++) {
      // Three sets an opaque clear color even when autoClear is false.
      gl.clearColor(0, 0, 0, 1);
      renderTarget.resetState();
      pass.draw(renderer as unknown as Renderer);
      expect(mist.mask).toBe(spriteMask);
      expect(mist.renderable).toBe(false);
      pass.restore();
      expect(mist.renderable).toBe(true);
    }
    expect(clears).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    pass.dispose();
    mask.destroy();
    mist.destroy();
    target.destroy();
  });

  it("leaves GL untouched for skipped, invisible and non-WebGL passes", () => {
    const { renderer, gl, target } = sharedRenderer();
    const mist = new Container();
    const pass = new SceneEffectsPass();
    pass.setLayers([mist]);
    pass.draw(renderer as unknown as Renderer, false);
    expect(mist.renderable).toBe(false);
    pass.restore();
    mist.visible = false;
    pass.draw(renderer as unknown as Renderer);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(gl.clearColor).not.toHaveBeenCalled();

    mist.visible = true;
    renderer.type = RendererType.WEBGPU;
    pass.draw(renderer as unknown as Renderer);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(gl.clearColor).not.toHaveBeenCalled();
    expect(gl.clear).not.toHaveBeenCalled();
    pass.dispose();
    mist.destroy();
    target.destroy();
  });
});
