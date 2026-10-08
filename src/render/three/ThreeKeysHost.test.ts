// @vitest-environment happy-dom
import { Container } from "pixi.js";
import type { Application } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandsLayer } from "../HandsLayer";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { PerspectiveKeyboardLayer } from "../PerspectiveKeyboardLayer";
import { ThreeKeysHost } from "./ThreeKeysHost";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  draw: vi.fn(),
  dispose: vi.fn(),
  loadKit: vi.fn(),
  loadHand: vi.fn()
}));

vi.mock("./ThreeStage", () => ({
  ThreeStage: class {
    hands = {};
    draw = mocks.draw;
    dispose = mocks.dispose;
    constructor(...args: unknown[]) {
      mocks.construct(...args);
    }
  }
}));
vi.mock("./pianoKit", () => ({ loadPianoKit: mocks.loadKit }));
vi.mock("./liveHands", () => ({ loadHand: mocks.loadHand }));

class SharedContext {
  flipY = true;
  premultiply = true;
  bindingsDirty = false;
}

function fixture() {
  const gl = new SharedContext();
  const canvas = document.createElement("canvas");
  const stage = new Container();
  const road = new Container();
  const keys = { container: new Container(), scene: { texture: { source: {} } } };
  const overlay = new Container();
  stage.addChild(road, overlay);
  const hands = { live: false, container: new Container(), time: 0, songNotes: [] };
  const renderer = {
    gl,
    resetState: vi.fn(() => {
      gl.flipY = false;
      gl.premultiply = false;
      gl.bindingsDirty = false;
    }),
    render: vi.fn(),
    texture: { getGlSource: vi.fn(() => ({ texture: {} })) }
  };
  const callbacks = new Set<() => void>();
  const render = vi.fn();
  callbacks.add(render);
  const ticker = {
    deltaMS: 16,
    add: vi.fn((callback: () => void) => callbacks.add(callback)),
    remove: vi.fn((callback: () => void) => callbacks.delete(callback))
  };
  const app = { renderer, ticker, stage, canvas, render, screen: { width: 800, height: 600 } };
  const host = new ThreeKeysHost(
    app as unknown as Application,
    road,
    keys as unknown as PerspectiveKeyboardLayer,
    {} as KeyboardLayer,
    hands as unknown as HandsLayer
  );
  return {
    gl,
    canvas,
    stage,
    road,
    keys,
    overlay,
    hands,
    renderer,
    callbacks,
    render,
    ticker,
    host,
    tick: () => {
      [...callbacks].forEach((callback) => {
        callback();
      });
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.construct.mockReset();
  mocks.draw.mockReset();
  mocks.dispose.mockReset();
  mocks.loadKit.mockReset().mockResolvedValue(new Map());
  mocks.loadHand.mockReset().mockResolvedValue({});
  vi.stubGlobal("WebGL2RenderingContext", SharedContext);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared WebGL keyboard recovery", () => {
  it("clears Pixi upload flags before Three initializes and invalidates its changed bindings", async () => {
    const view = fixture();
    mocks.construct.mockImplementation(() => {
      expect(view.gl.flipY).toBe(false);
      expect(view.gl.premultiply).toBe(false);
      view.gl.bindingsDirty = true;
    });
    await view.host.setEnabled(true);
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(view.gl.bindingsDirty).toBe(false);
    expect(view.host.on).toBe(true);
    view.host.destroy();
  });

  it("restores Pixi state even when the Three constructor fails", async () => {
    const view = fixture();
    mocks.construct.mockImplementation(() => {
      view.gl.bindingsDirty = true;
      throw new Error("renderer initialization failed");
    });
    await view.host.setEnabled(true);
    expect(view.host.on).toBe(false);
    expect(view.gl.bindingsDirty).toBe(false);
    expect(view.keys.container.renderable).toBe(true);
    expect(view.road.parent).toBe(view.stage);
    expect(view.callbacks).toEqual(new Set([view.render]));
    view.host.destroy();
  });

  it("leaves 2D rendering usable when disabled while the model is loading", async () => {
    const kit = deferred<Map<string, unknown>>();
    mocks.loadKit.mockReturnValue(kit.promise);
    const view = fixture();
    const loading = view.host.setEnabled(true);
    await view.host.setEnabled(false);
    mocks.construct.mockImplementation(() => {
      view.gl.bindingsDirty = true;
    });
    kit.resolve(new Map());
    await loading;
    expect(view.host.on).toBe(false);
    expect(view.gl.bindingsDirty).toBe(false);
    expect(view.callbacks).toEqual(new Set([view.render]));
    view.host.destroy();
  });

  it("never initializes a renderer after the view is destroyed during loading", async () => {
    const kit = deferred<Map<string, unknown>>();
    mocks.loadKit.mockReturnValue(kit.promise);
    const view = fixture();
    const loading = view.host.setEnabled(true);
    view.host.destroy();
    const appCalls = view.renderer.resetState.mock.calls.length;
    kit.resolve(new Map());
    await loading;
    await view.host.setEnabled(true);
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(view.renderer.resetState).toHaveBeenCalledTimes(appCalls);
    expect(view.host.on).toBe(false);
  });

  it.each(["draw", "texture"] as const)(
    "restores keyboard, road, hands and the regular ticker in the same frame after a %s failure",
    async (failure) => {
      const view = fixture();
      await view.host.setEnabled(true);
      view.tick();
      expect(view.keys.container.renderable).toBe(false);
      expect(view.road.parent).toBeNull();
      expect(view.hands.live).toBe(true);
      const fail = () => {
        view.gl.bindingsDirty = true;
        throw new Error("3D frame failed");
      };
      if (failure === "draw") mocks.draw.mockImplementation(fail);
      else view.renderer.texture.getGlSource.mockImplementation(fail);
      view.renderer.render.mockClear();
      expect(() => {
        view.tick();
      }).not.toThrow();
      expect(view.host.on).toBe(false);
      expect(view.keys.container.renderable).toBe(true);
      expect(view.stage.children).toEqual([view.road, view.overlay]);
      expect(view.hands.live).toBe(false);
      expect(view.gl.bindingsDirty).toBe(false);
      expect(view.renderer.render).toHaveBeenLastCalledWith({ container: view.stage });
      expect(view.callbacks).toEqual(new Set([view.render]));
      expect(mocks.dispose).toHaveBeenCalledOnce();
      view.tick();
      expect(view.render).toHaveBeenCalledOnce();
      expect(mocks.dispose).toHaveBeenCalledOnce();
      view.host.destroy();
    }
  );

  it("prepares restored contexts before Three reinitializes and resets Pixi afterwards", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    const threeRestored = vi.fn(() => {
      expect(view.gl.flipY).toBe(false);
      expect(view.gl.premultiply).toBe(false);
      view.gl.bindingsDirty = true;
    });
    view.canvas.addEventListener("webglcontextrestored", threeRestored);
    view.gl.flipY = true;
    view.gl.premultiply = true;
    view.canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(threeRestored).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(view.gl.bindingsDirty).toBe(false);
    view.canvas.removeEventListener("webglcontextrestored", threeRestored);
    view.host.destroy();
    view.renderer.resetState.mockClear();
    view.canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();
    expect(view.renderer.resetState).not.toHaveBeenCalled();
  });
});
