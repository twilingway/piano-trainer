// @vitest-environment happy-dom
import { Camera, Group, type Vector2 } from "three";
import type { SourcePerformanceIdentity } from "../../song/sourcePerformance";
import type { SongStage } from "../../song/songStage";
import { Container } from "../flatThree";
import type { Application } from "../flatThree";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongNote } from "../../song/song";
import type { NativeContactNotes } from "./NativeKeyContacts";
import type { HandsLayer } from "../HandsLayer";
import type { KeyboardLayer } from "../KeyboardLayer";
import type { NativeKeyboardScene } from "../NativeKeyboardScene";
import { ThreeKeysHost } from "./ThreeKeysHost";
import { ThreeRoadFrame } from "./ThreeRoadFrame";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  draw: vi.fn(),
  clearEnergy: vi.fn(),
  suspendProjection: vi.fn(),
  setKeyboardDim: vi.fn(),
  dispose: vi.fn(),
  loadKit: vi.fn(),
  loadHand: vi.fn(),
  setFreeCamera: vi.fn(),
  resetFreeCamera: vi.fn(),
  freeKeyAt: vi.fn(),
  nativeEffectsReady: false,
  projectionGeometryOnly: false,
  handPresent: true,
  loadPianist: vi.fn(),
  pianistConstruct: vi.fn(),
  pianistSample: vi.fn(),
  pianistTopView: vi.fn(),
  pianistBodyVisible: vi.fn(),
  pianistDispose: vi.fn(),
  disposeModel: vi.fn(),
  setSongStage: vi.fn(),
  addToKeys: vi.fn(),
  removeFromKeys: vi.fn(),
  pose: vi.fn(),
  publicReady: false,
  publicStatus: "loading",
  publicSync: vi.fn(),
  publicPose: vi.fn(),
  publicClear: vi.fn(),
  publicDispose: vi.fn(),
  handGroup: { visible: true }
}));

vi.mock("./ThreeStage", () => ({
  ThreeStage: class {
    beforeRender: ((camera: Camera) => void) | undefined;
    setSongStage = mocks.setSongStage;
    addToKeys = mocks.addToKeys;
    removeFromKeys = mocks.removeFromKeys;
    get nativeEffectsReady() {
      return mocks.nativeEffectsReady;
    }
    get projectionGeometryOnly() {
      return mocks.projectionGeometryOnly;
    }
    setPerformanceScene = vi.fn();
    draw(...args: unknown[]): void {
      mocks.draw.apply(this, args);
      (args[11] as (() => void) | undefined)?.();
    }
    clearEnergy = mocks.clearEnergy;
    suspendProjection = mocks.suspendProjection;
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
vi.mock("./keyboard88", () => ({ loadKeyboard88: mocks.loadKit }));
vi.mock("./liveHands", () => ({ loadHand: mocks.loadHand }));
vi.mock("./Keyboard88PerformerHost", () => ({
  Keyboard88PerformerHost: class {
    get ready() {
      return mocks.publicReady;
    }
    get status() {
      return mocks.publicStatus;
    }
    sync = mocks.publicSync;
    pose = mocks.publicPose;
    clear = mocks.publicClear;
    dispose = mocks.publicDispose;
  }
}));

vi.mock("./pianist", () => ({
  loadPianist: mocks.loadPianist,
  Pianist: class {
    readonly space = new Group();
    readonly native: boolean;
    readonly rig = { pose: mocks.pose, setNativeHandsVisible: vi.fn() };
    sample = mocks.pianistSample;
    setTopView = mocks.pianistTopView;
    setBodyVisible = mocks.pianistBodyVisible;
    poseFallback = mocks.pose;
    dispose = mocks.pianistDispose;
    follow = vi.fn();
    constructor(model: { performance?: unknown }, source?: unknown) {
      this.native = model.performance !== undefined;
      mocks.pianistConstruct(model, source);
    }
  }
}));
vi.mock("./disposePianistModel", () => ({ disposePianistModel: mocks.disposeModel }));

function fixture() {
  const canvas = document.createElement("canvas");
  const stage = new Container();
  const road = new Container();
  const keys = {
    container: new Container(),
    scene: { texture: { nativeTexture: {} }, camera: { params: { prefs: { pitch: 25 } } } }
  };
  const overlay = new Container();
  stage.addChild(road, overlay);
  const hands = {
    live: false,
    container: new Container(),
    time: 0,
    songNotes: { left: [], right: [] } as NativeContactNotes,
    pianist: false,
    renderedStyle: false,
    songPerformance: undefined as SourcePerformanceIdentity | undefined,
    songStage: undefined as SongStage | undefined
  };
  const renderer = {
    threeRenderer: { dispose: vi.fn() },
    render:
      vi.fn<(options: { container: Container; clear?: boolean; transform?: unknown }) => void>()
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
  const keyboard = { frame: undefined as KeyboardLayer["frame"] };
  const host = new ThreeKeysHost(
    app as unknown as Application,
    road,
    keys as unknown as NativeKeyboardScene,
    keyboard as KeyboardLayer,
    hands as unknown as HandsLayer
  );
  return {
    canvas,
    stage,
    road,
    keys,
    overlay,
    keyboard,
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
  mocks.nativeEffectsReady = false;
  mocks.projectionGeometryOnly = false;
  mocks.handPresent = true;
  mocks.publicReady = false;
  mocks.publicStatus = "loading";
  mocks.handGroup.visible = true;
  mocks.loadPianist.mockReset().mockResolvedValue(undefined);
  mocks.construct.mockReset();
  mocks.draw.mockReset();
  mocks.dispose.mockReset();
  mocks.loadKit.mockReset().mockResolvedValue({ keys: new Map(), dispose: vi.fn() });
  mocks.loadHand.mockReset().mockResolvedValue({});
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared WebGL keyboard recovery", () => {
  it("keeps flat effects hidden through the final HUD pass in active geometry-only projection", async () => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container()),
      mist = view.overlay.addChild(new Container());
    view.host.setSceneEffects([fire], [mist]);
    await view.host.setEnabled(true);
    mocks.projectionGeometryOnly = true;
    view.renderer.render.mockImplementation(({ container }) => {
      expect(container).not.toBe(fire);
      expect(container).not.toBe(mist);
      if (container === view.stage) {
        expect(fire.renderable).toBe(false);
        expect(mist.renderable).toBe(false);
      }
    });
    view.tick();
    expect(fire.renderable).toBe(true);
    expect(mist.renderable).toBe(true);
    view.host.destroy();
  });
  it("releases screen projection ownership when native rendering stops", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    mocks.suspendProjection.mockClear();
    await view.host.setEnabled(false, false);
    expect(mocks.suspendProjection).toHaveBeenCalledOnce();
    view.host.destroy();
  });
  it("draws flat road, native scene and HUD in order", async () => {
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

  it("hands the song's stage sign to the 3D stage before it draws", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    view.hands.songStage = { sign: "Sample sign" };
    mocks.setSongStage.mockClear();
    view.tick();
    expect(mocks.setSongStage).toHaveBeenLastCalledWith({ sign: "Sample sign" });
    expect(mocks.setSongStage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.draw.mock.invocationCallOrder.at(-1) ?? 0
    );
    view.hands.songStage = undefined;
    view.tick();
    expect(mocks.setSongStage).toHaveBeenLastCalledWith(undefined);
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
    expect(view.host.drawsRoad).toBe(true);
    view.road.visible = false;
    expect(view.host.drawsRoad).toBe(false);
    view.host.destroy();
  });

  it("draws the shared road with flat keys and hidden keyboard metadata", async () => {
    const view = fixture();
    const frame = new ThreeRoadFrame();
    view.host.setRoadFrame(frame);
    view.keys.container.visible = false;
    await view.host.setEnabled(false, true);
    view.tick();
    expect(view.host.on).toBe(false);
    expect(view.host.drawsRoad).toBe(true);
    expect(mocks.draw.mock.lastCall?.[8]).toBe(frame);
    expect(mocks.draw.mock.lastCall?.[12]).toBe(false);
    expect(view.hands.live).toBe(false);
    expect(view.overlay.parent).toBe(view.stage);
    view.host.destroy();
    expect(view.callbacks.has(view.render)).toBe(true);
  });

  it("keeps native keys when notes are hidden and omits the stale road snapshot", async () => {
    const view = fixture();
    view.host.setRoadFrame(new ThreeRoadFrame());
    await view.host.setEnabled(true);
    view.road.visible = false;
    view.tick();
    expect(view.host.on).toBe(true);
    expect(view.host.drawsRoad).toBe(false);
    expect(mocks.draw.mock.lastCall?.[8]).toBeUndefined();
    expect(mocks.draw.mock.lastCall?.[12]).toBe(true);
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

  it("reuses the application's renderer and ordinary texture without allocating a context", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    expect(mocks.construct.mock.calls[0]?.[0]).toBe(view.renderer.threeRenderer);
    view.tick();
    expect(mocks.draw.mock.calls[0]?.[1]).toBe(view.keys.scene.texture.nativeTexture);
    view.host.destroy();
    expect(view.renderer.threeRenderer.dispose).not.toHaveBeenCalled();
  });

  it("keeps the flat scene usable when the native stage constructor fails", async () => {
    const view = fixture();
    mocks.construct.mockImplementation(() => {
      throw new Error("renderer initialization failed");
    });
    await view.host.setEnabled(true);
    expect(view.host.on).toBe(false);
    expect(view.keys.container.renderable).toBe(true);
    expect(view.road.parent).toBe(view.stage);
    expect(view.callbacks).toEqual(new Set([view.render]));
    view.host.destroy();
  });

  it("leaves 2D rendering usable when disabled while the model is loading", async () => {
    const kit = deferred<{ keys: Map<string, unknown>; dispose: ReturnType<typeof vi.fn> }>();
    mocks.loadKit.mockReturnValue(kit.promise);
    const view = fixture();
    const loading = view.host.setEnabled(true);
    await view.host.setEnabled(false);
    kit.resolve({ keys: new Map(), dispose: vi.fn() });
    await loading;
    expect(view.host.on).toBe(false);
    expect(view.callbacks).toEqual(new Set([view.render]));
    view.host.destroy();
  });

  it("never initializes a renderer after the view is destroyed during loading", async () => {
    const kit = deferred<{ keys: Map<string, unknown>; dispose: ReturnType<typeof vi.fn> }>();
    mocks.loadKit.mockReturnValue(kit.promise);
    const view = fixture();
    const loading = view.host.setEnabled(true);
    view.host.destroy();
    kit.resolve({ keys: new Map(), dispose: vi.fn() });
    await loading;
    await view.host.setEnabled(true);
    expect(mocks.construct).not.toHaveBeenCalled();
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
        throw new Error("3D frame failed");
      };
      if (failure === "draw") mocks.draw.mockImplementation(fail);
      else Object.defineProperty(view.keys.scene.texture, "nativeTexture", { get: fail });
      view.renderer.render.mockClear();
      expect(() => {
        view.tick();
      }).not.toThrow();
      expect(view.host.on).toBe(false);
      expect(view.keys.container.renderable).toBe(true);
      expect(view.stage.children).toEqual([view.road, view.overlay]);
      expect(view.hands.live).toBe(false);
      expect(view.renderer.render).toHaveBeenLastCalledWith({ container: view.stage });
      expect(view.callbacks).toEqual(new Set([view.render]));
      expect(mocks.dispose).toHaveBeenCalledOnce();
      view.tick();
      expect(view.render).toHaveBeenCalledOnce();
      expect(mocks.dispose).toHaveBeenCalledOnce();
      view.host.destroy();
    }
  );

  it("preserves the stage and renderer across native context restoration", async () => {
    const view = fixture();
    await view.host.setEnabled(true);
    view.host.setFreeCamera(true);
    view.tick();
    const creations = mocks.construct.mock.calls.length;
    view.canvas.dispatchEvent(new Event("webglcontextrestored"));
    view.tick();
    expect(view.host.freeCamera).toBe(true);
    expect(mocks.construct).toHaveBeenCalledTimes(creations);
    expect(mocks.dispose).not.toHaveBeenCalled();
    view.host.destroy();
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
    ).toBe(false);
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

describe("performance scene input and fallback", () => {
  it("maps a computer plate raycast UV to the actual letter position", async () => {
    const view = fixture();
    Object.assign(view.keys.scene, {
      faces: [{ key: { pitch: 0, black: false, x: 0, width: 800 }, source: { y: 0, height: 120 } }],
      texture: { width: 800, height: 120 }
    });
    await view.host.setEnabled(true);
    mocks.freeKeyAt.mockImplementation(
      (_x: number, _y: number, _width: number, _height: number, surface?: Vector2) => {
        if (!surface) throw new Error("Missing plate surface target");
        surface.set(0.25, 0.75);
        return 0;
      }
    );
    expect(view.host.freeKeysPointAt(300, 200)).toEqual({ x: 200, y: 90 });
    view.host.destroy();
  });

  it("returns an explicit physical pitch for a visible key outside the song's painted range", async () => {
    const view = fixture();
    Object.assign(view.keys.scene, {
      faces: [{ key: { pitch: 60, black: false, x: 0, width: 47 }, source: { y: 60, height: 40 } }],
      camera: {
        params: { width: 800, sourceUnits: 0.5, keyboardDepth: 150 },
        sourceX: (x: number) => (x - 400) / 2
      }
    });
    await view.host.setEnabled(true);
    view.tick();
    mocks.freeKeyAt.mockReturnValue(48);
    expect(view.host.freeKeysPointAt(300, 200)).toEqual({ x: -305.5, y: 1, pitch: 48 });
    view.host.destroy();
  });
  it.each([
    { pitch: 60, x: 30, width: 40, y: 80, height: 60 },
    { pitch: 61, x: 60, width: 20, y: 0, height: 75 }
  ])(
    "maps mesh pitch $pitch to its white or black source face and stops after Three failure",
    async (face) => {
      const view = fixture();
      Object.assign(view.keys.scene, {
        faces: [
          {
            key: { pitch: face.pitch, x: face.x, width: face.width },
            source: { y: face.y, height: face.height }
          }
        ]
      });
      view.host.setPerformanceScene(true);
      expect(view.host.sceneCamera).toBe(false);
      await view.host.setEnabled(true);
      view.tick();
      expect(view.host.sceneCamera).toBe(true);
      mocks.freeKeyAt.mockReturnValue(face.pitch);
      expect(view.host.freeKeysPointAt(300, 200)).toEqual({
        x: face.x + face.width / 2,
        y: face.y + face.height / 2
      });
      mocks.draw.mockImplementationOnce(() => {
        throw new Error("forced Three failure");
      });
      view.tick();
      expect(view.host.performanceScene).toBe(false);
      expect(view.host.sceneCamera).toBe(false);
      expect(view.host.freeKeysPointAt(300, 200)).toBeUndefined();
      expect(view.keys.container.renderable).toBe(true);
      expect(view.hands.live).toBe(false);
      view.host.destroy();
    }
  );
});

describe("native stage effects handoff", () => {
  it("restores legacy effects after inspection loses its 3D renderer", async () => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container());
    const mist = view.overlay.addChild(new Container());
    view.host.setSceneEffects([fire], [mist]);
    view.host.setFreeCamera(true);
    await view.host.setEnabled(true);
    mocks.draw.mockImplementationOnce(() => {
      expect(fire.renderable).toBe(false);
      expect(mist.renderable).toBe(false);
      throw new Error("context lost");
    });
    view.tick();
    expect(view.host.on).toBe(false);
    expect(view.host.freeCamera).toBe(false);
    expect(view.road.parent).toBe(view.stage);
    expect(fire.renderable).toBe(true);
    expect(mist.renderable).toBe(true);
    expect(view.renderer.render.mock.calls.at(-1)?.[0].container).toBe(view.stage);
    view.host.destroy();
  });

  it("hides screen FX throughout inspection loading and restores the ordinary view on exit", async () => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container());
    const mist = view.overlay.addChild(new Container());
    view.host.setSceneEffects([fire], [mist]);
    view.host.setFreeCamera(true);
    await view.host.setEnabled(true);
    mocks.draw.mockImplementation(() => {
      expect(fire.renderable).toBe(false);
      expect(mist.renderable).toBe(false);
    });
    const screenFxDraws = () =>
      view.renderer.render.mock.calls.filter(
        ([options]) => options.container === fire || options.container === mist
      );
    view.tick();
    expect(screenFxDraws()).toHaveLength(0);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(false);
    mocks.nativeEffectsReady = true;
    view.tick();
    expect(screenFxDraws()).toHaveLength(0);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(true);
    expect(fire.renderable).toBe(true);
    expect(mist.renderable).toBe(true);
    mocks.draw.mockReset();
    view.host.setFreeCamera(false);
    view.tick();
    expect(screenFxDraws()).toHaveLength(1);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(false);
    expect(view.host.freeCamera).toBe(false);
    view.host.destroy();
  });

  it("keeps legacy FX until all atlases are ready and restores them outside performance mode", async () => {
    const view = fixture();
    const fire = view.overlay.addChild(new Container());
    view.host.setSceneEffects([fire]);
    view.host.setPerformanceScene(true);
    await view.host.setEnabled(true);
    const renderedFire = () =>
      view.renderer.render.mock.calls.some(([options]) => options.container === fire);
    view.tick();
    expect(renderedFire()).toBe(true);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(false);
    mocks.nativeEffectsReady = true;
    view.renderer.render.mockClear();
    mocks.draw.mockImplementation(() => {
      expect(fire.renderable).toBe(false);
    });
    view.tick();
    expect(renderedFire()).toBe(false);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(true);
    expect(fire.renderable).toBe(true);
    view.host.setPerformanceScene(false);
    view.renderer.render.mockClear();
    view.tick();
    expect(renderedFire()).toBe(true);
    expect(mocks.draw.mock.calls.at(-1)?.[9]).toBe(false);
    view.host.destroy();
  });
});

describe("Flat effects under native hands", () => {
  it("draws transformed FX through the road/case callback, once, before HUD", async () => {
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
    expect(order).toEqual(["road", "three", "fire", "hud"]);
    expect(
      view.renderer.render.mock.calls.find(([options]) => options.container === fire)?.[0]
    ).toMatchObject({ clear: false, transform: { tx: 37, ty: -10 } });
    expect(fire.renderable).toBe(true);
    expect(fire.parent).toBe(view.overlay);
    view.host.destroy();
    expect(fire.destroyed).toBe(false);
  });

  it.each(["three", "fx", "hud"])("restores FX flags after a %s failure", async (failure) => {
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
        if (options.container === (failure === "fx" ? fire : view.stage))
          throw new Error(`${failure} failed`);
      });
    if (failure !== "hud") expect(view.tick).not.toThrow();
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

const sourcePerformance = (id: string): SourcePerformanceIdentity => ({
  id,
  midiSha256: "a".repeat(64),
  sourceSha256: "b".repeat(64),
  noteCount: 1,
  timeOriginSeconds: 0
});
const settlePianist = async () => {
  await vi.dynamicImportSettled();
};

describe("native source pianist handoff", () => {
  it("reloads a trial after source restoration and sends identity/time to the pre-render callback", async () => {
    const view = fixture();
    view.hands.pianist = true;
    mocks.loadPianist.mockResolvedValueOnce({ scene: new Group(), clip: undefined });
    await view.host.setEnabled(true);
    view.tick();
    await settlePianist();
    view.tick();
    expect(mocks.loadPianist).toHaveBeenLastCalledWith(undefined);
    const source = sourcePerformance("restored");
    view.hands.songPerformance = source;
    mocks.loadPianist.mockResolvedValueOnce({ scene: new Group(), clip: {}, performance: {} });
    view.tick();
    await settlePianist();
    const beforeDraw: string[] = [];
    mocks.draw.mockImplementation(function (this: { beforeRender?: (camera: Camera) => void }) {
      this.beforeRender?.(new Camera());
      beforeDraw.push("draw");
    });
    mocks.pianistSample.mockImplementation(() => beforeDraw.push("sample"));
    view.hands.time = 103;
    view.tick();
    expect(mocks.pianistDispose).toHaveBeenCalledOnce();
    expect(mocks.removeFromKeys).toHaveBeenCalledOnce();
    expect(mocks.loadPianist).toHaveBeenLastCalledWith(source);
    expect(mocks.pianistSample.mock.calls.at(-1)?.[0]).toMatchObject({
      time: 103,
      performance: source
    });
    expect(beforeDraw).toEqual(["sample", "draw"]);
    view.host.destroy();
  });
  it("disposes a stale load even when it resolves before the next source-change frame", async () => {
    const view = fixture(),
      pending = deferred<{ scene: Group; clip: undefined }>();
    view.hands.pianist = true;
    mocks.loadPianist.mockReturnValueOnce(pending.promise);
    await view.host.setEnabled(true);
    view.tick();
    await vi.dynamicImportSettled();
    view.hands.songPerformance = sourcePerformance("new");
    const scene = new Group();
    pending.resolve({ scene, clip: undefined });
    await settlePianist();
    expect(mocks.disposeModel).toHaveBeenCalledWith(scene);
    expect(mocks.pianistConstruct).not.toHaveBeenCalled();
    view.tick();
    await settlePianist();
    expect(mocks.loadPianist).toHaveBeenLastCalledWith(view.hands.songPerformance);
    view.host.destroy();
  });
  it("disposes late loads after destruction and does not retry a missing asset every frame", async () => {
    const view = fixture();
    view.hands.pianist = true;
    await view.host.setEnabled(true);
    view.tick();
    await settlePianist();
    view.tick();
    view.tick();
    expect(mocks.loadPianist).toHaveBeenCalledOnce();
    const pending = deferred<{ scene: Group; clip: undefined }>();
    view.hands.songPerformance = sourcePerformance("late");
    mocks.loadPianist.mockReturnValueOnce(pending.promise);
    view.tick();
    await vi.dynamicImportSettled();
    view.host.destroy();
    const scene = new Group();
    pending.resolve({ scene, clip: undefined });
    await settlePianist();
    expect(mocks.disposeModel).toHaveBeenCalledWith(scene);
    expect(mocks.pianistConstruct).not.toHaveBeenCalled();
  });
});

it("keeps sprite/Studio hands hidden for a complete native model even when the Studio asset failed", async () => {
  mocks.handPresent = false;
  const view = fixture();
  view.hands.pianist = true;
  view.hands.songPerformance = sourcePerformance("native-no-studio");
  mocks.loadPianist.mockResolvedValue({ scene: new Group(), clip: {}, performance: {} });
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  view.tick();
  expect(view.hands.live).toBe(true);
  view.hands.pianist = false;
  view.tick();
  expect(view.hands.live).toBe(true);
  expect(mocks.pianistBodyVisible).toHaveBeenLastCalledWith(false);
  view.hands.container.visible = false;
  view.tick();
  expect(view.hands.live).toBe(true);
  view.host.destroy();
});

it("loads native hands without a body, samples them and switches every visibility combination", async () => {
  const view = fixture(),
    camera = new Camera();
  view.hands.songPerformance = sourcePerformance("hands-only");
  mocks.loadPianist.mockResolvedValueOnce({ scene: new Group(), clip: {}, performance: {} });
  mocks.draw.mockImplementation(function (this: { beforeRender?: (camera: Camera) => void }) {
    this.beforeRender?.(camera);
  });
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  view.hands.time = 42;
  view.tick();
  expect(mocks.loadPianist).toHaveBeenLastCalledWith(view.hands.songPerformance, true);
  expect(mocks.pianistBodyVisible).toHaveBeenLastCalledWith(false);
  expect(mocks.pianistSample).toHaveBeenLastCalledWith(
    expect.objectContaining({ time: 42, performance: view.hands.songPerformance }),
    camera
  );
  const space = mocks.addToKeys.mock.calls.at(-1)?.[0] as Group;
  expect(space.visible).toBe(true);
  for (const [body, hands, native] of [
    [true, true, true],
    [true, false, true],
    [false, true, true],
    [false, false, false]
  ]) {
    view.hands.pianist = body ?? false;
    view.hands.container.visible = hands ?? false;
    mocks.pianistSample.mockClear();
    view.tick();
    expect(space.visible).toBe(native);
    expect(mocks.pianistSample.mock.calls.length).toBe(native ? 1 : 0);
    if (native) expect(mocks.pianistBodyVisible).toHaveBeenLastCalledWith(body);
  }
  expect(mocks.loadPianist).toHaveBeenCalledOnce();
  view.host.destroy();
});

it("does not try the trial for hands alone, but can load it when the body is enabled later", async () => {
  const view = fixture();
  view.hands.songPerformance = sourcePerformance("missing-native");
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  view.tick();
  expect(mocks.loadPianist).toHaveBeenCalledExactlyOnceWith(view.hands.songPerformance, true);
  view.hands.pianist = true;
  view.tick();
  await settlePianist();
  expect(mocks.loadPianist).toHaveBeenLastCalledWith(view.hands.songPerformance);
  expect(mocks.loadPianist).toHaveBeenCalledTimes(2);
  view.host.destroy();
});

it("drives native keys from physical source contacts and keeps manual presses above them", async () => {
  const view = fixture();
  view.hands.pianist = true;
  view.hands.songPerformance = sourcePerformance("contacts");
  const sourceFinger = {
    sourceId: "known",
    pitch: 60,
    hand: "right" as const,
    onset: 1,
    estimatedContactEnd: 1.1,
    finger: 3 as const,
    candidateFinger: 3 as const,
    origin: "teacher" as const,
    selectedFrom: "decision" as const
  };
  view.hands.songNotes = {
    left: [],
    right: [
      { pitch: 60, start: 1, duration: 5, sourceFinger },
      {
        pitch: 60,
        start: 2,
        duration: 4,
        sourceFinger: { ...sourceFinger, onset: 2, estimatedContactEnd: 2.1 }
      },
      {
        pitch: 61,
        start: 1,
        duration: 2,
        sourceFinger: { ...sourceFinger, pitch: 61, finger: null, origin: "unknown" }
      }
    ]
  };
  const pressed = new Set<number>(),
    sounding = new Set([60, 61, 62]);
  view.keyboard.frame = { pressed, sounding, playing: new Map<number, SongNote>(), due: [] };
  mocks.loadPianist.mockResolvedValue({ scene: new Group(), clip: {}, performance: {} });
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  const downAt = (time: number, pitch: number): boolean => {
    view.hands.time = time;
    view.tick();
    const down = mocks.draw.mock.calls.at(-1)?.[2] as (pitch: number) => boolean;
    return down(pitch);
  };
  view.hands.pianist = false;
  expect(downAt(1, 60)).toBe(true);
  expect(downAt(1.1, 60)).toBe(false);
  expect(downAt(2, 60)).toBe(true);
  expect(downAt(1.5, 60)).toBe(false);
  expect(downAt(1.5, 61)).toBe(true);
  expect(downAt(1.5, 62)).toBe(true);
  pressed.add(60);
  expect(downAt(1.5, 60)).toBe(true);
  pressed.clear();
  expect(downAt(3, 61)).toBe(false);
  view.host.destroy();
});

it("reloads a previously unavailable native asset when trusted duration arrives with the same hashes", async () => {
  const view = fixture();
  view.hands.pianist = true;
  view.hands.songPerformance = sourcePerformance("duration-restored");
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  expect(mocks.loadPianist).toHaveBeenCalledOnce();
  view.hands.songPerformance = { ...view.hands.songPerformance, durationSeconds: 154.5 };
  view.tick();
  await settlePianist();
  expect(mocks.loadPianist).toHaveBeenCalledTimes(2);
  expect(mocks.loadPianist).toHaveBeenLastCalledWith(view.hands.songPerformance);
  view.host.destroy();
});

it("hides the pianist lower body only in ordinary overhead, preserving perspective, free and performance", async () => {
  const view = fixture(),
    camera = { params: { prefs: { pitch: 90 } } };
  Object.assign(view.keys.scene, { keyboardCamera: camera });
  view.hands.pianist = true;
  mocks.loadPianist.mockResolvedValueOnce({ scene: new Group(), clip: {}, performance: {} });
  await view.host.setEnabled(true);
  view.tick();
  await settlePianist();
  view.tick();
  expect(mocks.pianistTopView).toHaveBeenLastCalledWith(true);
  camera.params.prefs.pitch = 42;
  view.tick();
  expect(mocks.pianistTopView).toHaveBeenLastCalledWith(false);
  camera.params.prefs.pitch = 90;
  view.host.setFreeCamera(true);
  view.tick();
  expect(mocks.pianistTopView).toHaveBeenLastCalledWith(false);
  view.host.setFreeCamera(false);
  view.host.setPerformanceScene(true);
  view.tick();
  expect(mocks.pianistTopView).toHaveBeenLastCalledWith(false);
  view.host.setPerformanceScene(false);
  view.tick();
  expect(mocks.pianistTopView).toHaveBeenLastCalledWith(true);
  view.host.destroy();
});

describe("public keyboard88 ownership", () => {
  it("suppresses old hands while pending and gives current time to the new public owner", async () => {
    const view = fixture();
    view.hands.renderedStyle = false;
    view.hands.time = 7.5;
    mocks.draw.mockImplementation(function (this: {
      beforeRender?: (camera: Camera, separateCameras: boolean) => void;
    }) {
      this.beforeRender?.(new Camera(), true);
    });
    await view.host.setEnabled(true);
    view.tick();
    expect(mocks.publicSync).toHaveBeenCalledOnce();
    expect(view.hands.live).toBe(true);
    expect(mocks.loadHand).not.toHaveBeenCalled();
    expect(mocks.loadPianist).not.toHaveBeenCalled();
    mocks.publicReady = true;
    view.tick();
    expect(mocks.publicPose).toHaveBeenLastCalledWith(expect.objectContaining({ time: 7.5 }), true);
    await view.host.setEnabled(false);
    expect(mocks.publicClear).toHaveBeenCalled();
    view.host.destroy();
  });

  it("keeps old sprites suppressed while loading and on a public model failure", async () => {
    const view = fixture();
    view.hands.renderedStyle = false;
    const loading = deferred<{ keys: Map<number, unknown>; dispose: () => void }>();
    mocks.loadKit.mockReturnValue(loading.promise);
    const enabled = view.host.setEnabled(true);
    expect(view.hands.live).toBe(true);
    loading.resolve({ keys: new Map(), dispose: vi.fn() });
    await enabled;
    view.tick();
    expect(view.hands.live).toBe(true);
    expect(mocks.loadHand).not.toHaveBeenCalled();
    mocks.publicStatus = "error";
    expect(view.host.handStatus).toBe("error");
    view.tick();
    expect(view.hands.live).toBe(true);
    await view.host.setEnabled(false, true);
    expect(view.hands.live).toBe(false);
    expect(view.host.handStatus).toBe("idle");
    view.host.destroy();
  });
});

it.each(Array.from({ length: 8 }, (_, mask) => mask))(
  "forwards all independent effect flags to the native scene (%s)",
  async (mask) => {
    const view = fixture();
    const effects = { burning: !!(mask & 1), presses: !!(mask & 2), musicalNotes: !!(mask & 4) };
    view.host.setEffects(effects);
    await view.host.setEnabled(true);
    view.tick();
    expect(mocks.draw.mock.lastCall?.[13]).toEqual(effects);
    view.host.destroy();
  }
);

it("reports native keyboard loading failure without returning to old hands", async () => {
  const view = fixture();
  mocks.loadKit.mockRejectedValueOnce(new Error("keyboard unavailable"));
  await view.host.setEnabled(true);
  expect(view.host.handStatus).toBe("error");
  expect(view.hands.live).toBe(true);
  expect(mocks.loadHand).not.toHaveBeenCalled();
  view.host.destroy();
});

it.each(["free", "performance"] as const)(
  "keeps %s camera ownership and advancing world time with falling notes hidden",
  async (mode) => {
    const view = fixture();
    view.road.visible = false;
    const staleRoad = new ThreeRoadFrame();
    staleRoad.songTime = 1;
    view.host.setRoadFrame(staleRoad);
    await view.host.setEnabled(true, false);
    if (mode === "free") view.host.setFreeCamera(true);
    else view.host.setPerformanceScene(true);
    mocks.nativeEffectsReady = true;
    for (const time of [12, 13.5]) {
      view.host.setSongTime(time);
      view.tick();
      expect(view.host.drawsRoad).toBe(false);
      expect(view.host.sceneCamera).toBe(true);
      expect(view.host.performanceScene).toBe(mode === "performance");
      expect(mocks.draw.mock.lastCall?.[8]).toBeUndefined();
      expect(mocks.draw.mock.lastCall?.[9]).toBe(true);
      expect(mocks.draw.mock.lastCall?.[14]).toBe(time);
    }
    view.keys.container.visible = false;
    view.tick();
    expect(view.host.sceneCamera).toBe(false);
    view.host.destroy();
  }
);

it.each(["loading", "failed"])(
  "releases repeated keys with hidden hands while the model is %s",
  async (status) => {
    const view = fixture();
    mocks.publicReady = false;
    mocks.publicStatus = status;
    view.hands.container.visible = false;
    view.hands.songNotes = {
      left: [],
      right: [
        { pitch: 60, start: 1, duration: 4 },
        { pitch: 60, start: 2, duration: 1 },
        { pitch: 61, start: 1, duration: 4 }
      ]
    };
    const pressed = new Set<number>();
    view.keyboard.frame = { pressed, sounding: new Set([60, 61]), due: [], playing: new Map() };
    await view.host.setEnabled(true);
    const downAt = (time: number) => {
      view.hands.time = time;
      view.tick();
      return mocks.draw.mock.lastCall?.[2] as (pitch: number) => boolean;
    };
    expect(downAt(1.8)(60)).toBe(true);
    expect(downAt(1.9)(60)).toBe(false);
    expect(downAt(1.9)(61)).toBe(true);
    expect(downAt(2)(60)).toBe(true);
    expect(downAt(1.9)(60)).toBe(false);
    pressed.add(60);
    expect(downAt(1.9)(60)).toBe(true);
    pressed.clear();
    view.keyboard.frame = { ...view.keyboard.frame, physicalDown: new Set([61]) };
    expect(downAt(2)(60)).toBe(false);
    expect(downAt(2)(61)).toBe(true);
    view.host.destroy();
  }
);
