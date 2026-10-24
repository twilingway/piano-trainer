// @vitest-environment happy-dom
import { Container } from "../flatThree";
import type { Renderer } from "../flatThree";
import { describe, expect, it, vi } from "vitest";
import { FlatSceneLayers } from "./FlatSceneLayers";

describe("flat scene pass ordering", () => {
  it("draws transformed effects once without clearing and restores their visibility", () => {
    const parent = new Container();
    parent.position.set(30, 40);
    const effect = new Container();
    effect.position.set(3, 4);
    parent.addChild(effect);
    const renderer = { render: vi.fn<Renderer["render"]>() };
    const pass = new FlatSceneLayers();
    pass.setLayers([effect]);
    pass.draw(renderer as unknown as Renderer);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(renderer.render.mock.calls[0]?.[0]).toMatchObject({
      clear: false,
      transform: { tx: 33, ty: 44 }
    });
    expect(effect.renderable).toBe(false);
    pass.restore();
    expect(effect.renderable).toBe(true);
    pass.dispose();
  });

  it("suppresses effects without drawing and skips invisible ancestry", () => {
    const parent = new Container();
    const effect = new Container();
    parent.addChild(effect);
    const renderer = { render: vi.fn<Renderer["render"]>() };
    const pass = new FlatSceneLayers();
    pass.setLayers([effect]);
    pass.draw(renderer as unknown as Renderer, false);
    expect(effect.renderable).toBe(false);
    pass.restore();
    parent.visible = false;
    pass.draw(renderer as unknown as Renderer);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(effect.renderable).toBe(true);
    pass.dispose();
  });
});
