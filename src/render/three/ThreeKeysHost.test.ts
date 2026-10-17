// @vitest-environment happy-dom
import { Container } from "pixi.js";
import type { Application } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandsLayer } from "../HandsLayer";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { PerspectiveKeyboardLayer } from "../PerspectiveKeyboardLayer";
import { ThreeKeysHost } from "./ThreeKeysHost";
import { ThreeRoadFrame } from "./ThreeRoadFrame";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  draw: vi.fn(),
  clearEnergy: vi.fn(),
  setKeyboardDim: vi.fn(),
  dispose: vi.fn(),
  loadKit: vi.fn(),
  loadHand: vi.fn(),
  setFreeCamera: vi.fn(),
  resetFreeCamera: vi.fn(),
  freeKeyAt: vi.fn()
}));

vi.mock("./ThreeStage", () => ({
  ThreeStage: class {
    hands = {};
    draw = mocks.draw;
    clearEnergy = mocks.clearEnergy;
    setKeyboardDim = mocks.setKeyboardDim;
    dispose = mocks.dispose;
    setFreeCamera = mocks.setFreeCamera;
    resetFreeCamera = mocks.resetFreeCamera;
    freeKeyAt = mocks.freeKeyAt;
    constructor(...args: unknown[]) {
      mocks.construct(...args);
    }
  }
}));
vi.mock("./pianoKit", () => ({ loadPianoKit: mocks.loadKit }));
vi.mock("./liveHands", () => ({ loadHand: mocks.loadHand }));

class SharedContext {
  readonly MAX_TEXTURE_IMAGE_UNITS = 34930;
  readonly TEXTURE0 = 33984;
  readonly TEXTURE_2D = 3553;
  readonly textures = new Map<number, WebGLTexture | null>();
  currentUnit = this.TEXTURE0;
  getParameter = vi.fn(() => 4);
  activeTexture(unit: number): void {
    this.currentUnit = unit;
  }
  bindTexture(_target: number, texture: WebGLTexture | null): void {
    this.textures.set(this.currentUnit, texture);
  }
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
    clear: vi.fn(),
    resetState: vi.fn(() => {
      gl.flipY = false;
      gl.premultiply = false;
      gl.bindingsDirty = false;
    }),
    render:
      vi.fn<(options: { container: Container; clear?: boolean; transform?: unknown }) => void>(),
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
  const restoreRoad = vi.fn(() => {
    expect(gl.bindingsDirty).toBe(false);
  });
  const host = new ThreeKeysHost(
    app as unknown as Application,
    road,
    keys as unknown as PerspectiveKeyboardLayer,
    {} as KeyboardLayer,
    hands as unknown as HandsLayer,
    restoreRoad
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
    restoreRoad,
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
  it("draws road, Three and HUD without an extra Pixi mist pass", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    const order: string[] = [];
    view.renderer.render.mockImplementation((options: { container: Container }) => {
      order.push(options.container === view.road ? "road" : "overlay");
    });
    mocks.draw.mockImplementation(() => order.push("three"));
    view.tick();
    expect(order).toEqual(["road", "three", "overlay"]);
    view.host.destroy();
  });

  it("passes native road snapshots only while the actual Three view can draw them", async () => {
    const view = fixture();
    const frame = new ThreeRoadFrame();
    view.host.setRoadFrame(frame);
    expect(view.host.drawsRoad).toBe(false);
    await view.host.setEnabled(true);
    expect(view.host.drawsRoad).toBe(true);
    view.tick();
    expect(mocks.draw.mock.calls[0]?.[8]).toBe(frame);
    view.keys.container.visible = false;
    expect(view.host.drawsRoad).toBe(false);
    view.host.destroy();
  });

  it("uses effect delta for paused lights while hands keep their existing frame delta", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    view.host.setEnergy([], 0);
    view.tick();
    expect(mocks.draw.mock.calls[0]?.[4]).toBe(0.016);
    expect(mocks.draw.mock.calls[0]?.[7]).toBe(0);
    view.host.setEnergy([], 0.05);
    view.tick();
    expect(mocks.draw.mock.calls[1]?.[7]).toBe(0.05);
    view.host.destroy();
  });

  it("clears stage energy synchronously before the next frame on seek or a new song", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    const energy = [
      { id: "same-note", pitch: 60, color: 0xff3040, strength: 1, progress: 1, sounding: true }
    ];
    view.host.setEnergy(energy, 0.016);
    view.tick();
    view.host.clearEnergy();
    expect(mocks.clearEnergy).toHaveBeenCalledOnce();
    expect(mocks.draw).toHaveBeenCalledOnce();
    view.tick();
    expect(mocks.draw.mock.calls[1]?.[6]).toEqual([]);
    view.host.setEnergy(energy, 0);
    view.tick();
    expect(mocks.draw.mock.calls[2]?.[7]).toBe(0);
    view.host.destroy();
  });

  it("passes the road's shared energy snapshot into Three and clears it on destruction", async () => {
    const view = fixture();
    const energy = [
      { id: "note-60", pitch: 60, color: 0xff3040, strength: 1, progress: 1, sounding: true }
    ];
    view.host.setEnergy(energy);
    await view.host.setEnabled(true);
    view.tick();
    expect(mocks.draw.mock.calls[0]?.[6]).toBe(energy);
    view.host.setEnergy([]);
    view.tick();
    expect(mocks.draw.mock.calls[1]?.[6]).toEqual([]);
    view.host.destroy();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

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
      expect(view.restoreRoad).toHaveBeenCalledOnce();
      expect(view.restoreRoad.mock.invocationCallOrder[0]).toBeLessThan(
        view.renderer.render.mock.invocationCallOrder.at(-1) ?? 0
      );
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

describe("free inspection host lifecycle", () => {
  it("activates gestures only for visible native 3D and cleans up on exit and draw failure", async () => {
    const view = fixture();
    const changed = vi.fn();
    view.host.onFreeCamera = changed;
    view.host.setFreeCamera(true);
    expect(changed).not.toHaveBeenCalled();
    await view.host.setEnabled(true);
    view.tick();
    expect(view.host.freeCamera).toBe(true);
    expect(mocks.setFreeCamera).toHaveBeenLastCalledWith(true);
    expect(view.renderer.render).toHaveBeenCalled();
    expect(
      view.renderer.render.mock.calls.some(([options]) => options.container === view.road)
    ).toBe(true);
    view.keys.container.visible = false;
    view.tick();
    expect(mocks.setFreeCamera).toHaveBeenLastCalledWith(false);
    view.keys.container.visible = true;
    view.tick();
    expect(mocks.setFreeCamera).toHaveBeenLastCalledWith(true);
    mocks.draw.mockImplementationOnce(() => {
      throw new Error("context failed");
    });
    view.tick();
    expect(view.host.freeCamera).toBe(false);
    expect(changed).toHaveBeenLastCalledWith(false);
    expect(mocks.setFreeCamera).toHaveBeenLastCalledWith(false);
    view.host.destroy();
  });
});

describe("Pixi FX under native hands", () => {
  it("draws transformed effects before Three, once, restoring their original ownership", async () => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container());
    view.overlay.position.set(30, -12);
    fire.position.set(7, 2);
    view.host.setSceneEffects([fire]);
    await view.host.setEnabled(true);
    const order: string[] = [];
    view.renderer.render.mockImplementation((options) => {
      order.push(
        options.container === fire ? "fire" : options.container === view.road ? "road" : "hud"
      );
      if (options.container === view.stage) expect(fire.renderable).toBe(false);
    });
    mocks.draw.mockImplementation(() => {
      order.push("three");
      expect(fire.renderable).toBe(false);
    });
    view.tick();
    expect(order).toEqual(["road", "fire", "three", "hud"]);
    expect(
      view.renderer.render.mock.calls.find(([options]) => options.container === fire)?.[0]
    ).toMatchObject({ clear: false, transform: { tx: 37, ty: -10 } });
    expect(fire.renderable).toBe(true);
    expect(fire.parent).toBe(view.overlay);
    view.host.destroy();
    expect(fire.destroyed).toBe(false);
  });

  it.each(["three", "hud"])("restores FX flags after a %s failure", async (failure) => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container());
    view.host.setSceneEffects([fire]);
    await view.host.setEnabled(true);
    if (failure === "three")
      mocks.draw.mockImplementationOnce(() => {
        throw new Error("draw failed");
      });
    else
      view.renderer.render.mockImplementation((options) => {
        if (options.container === view.stage) throw new Error("hud failed");
      });
    if (failure === "three") expect(view.tick).not.toThrow();
    else expect(view.tick).toThrow("hud failed");
    expect(fire.renderable).toBe(true);
    expect(fire.parent).toBe(view.overlay);
    view.host.destroy();
  });
});

it("skips hidden or destroyed FX without suppressing native Three", async () => {
  const view = fixture();
  const fire = view.overlay.addChild(new Container());
  view.host.setSceneEffects([fire]);
  await view.host.setEnabled(true);
  view.overlay.visible = false;
  view.tick();
  expect(mocks.draw).toHaveBeenCalledOnce();
  expect(view.renderer.render.mock.calls.some(([options]) => options.container === fire)).toBe(
    false
  );
  view.overlay.visible = true;
  view.renderer.render.mockClear();
  view.tick();
  expect(view.renderer.render.mock.calls.some(([options]) => options.container === fire)).toBe(
    true
  );
  expect(fire.renderable).toBe(true);
  fire.destroy();
  expect(view.tick).not.toThrow();
  view.host.destroy();
});
