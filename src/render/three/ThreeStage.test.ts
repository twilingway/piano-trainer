import { BoxGeometry, Camera, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import type { KeyPress } from "./liveHands";
import { ThreeStage } from "./ThreeStage";

/** Exercise the actual frame method with GPU rendering isolated, including its contact ordering. */
function fixture() {
  const keys = new Map<number, KeyPress>();
  const hinge = new Group();
  const geometryDispose = vi.fn();
  const mesh = { geometry: { dispose: geometryDispose } } as unknown as Mesh;
  const hands = { group: new Group(), keys, update: vi.fn(), suspend: vi.fn(), dispose: vi.fn() };
  const renderer = {
    resetState: vi.fn(),
    setViewport: vi.fn(),
    clearDepth: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
  };
  const disposable = () => ({ dispose: vi.fn() });
  const layer = () => ({ ...disposable(), update: vi.fn() });
  const stage = Object.create(ThreeStage.prototype) as ThreeStage;
  Object.assign(stage, {
    version: 1,
    disposed: false,
    picture: {},
    keys: new Group(),
    road: new Group(),
    lighting: new Group(),
    baseLighting: new Group(),
    body: new Group(),
    scene: new Scene(),
    roadCamera: new Camera(),
    keyboardCamera: new Camera(),
    hinged: [{ pitch: 60, hinge, mesh }],
    hands,
    renderer,
    context: { drawingBufferWidth: 800, drawingBufferHeight: 600 },
    configureCamera: vi.fn(),
    roadNotes: { ...disposable(), setViewport: vi.fn() },
    roadTrails: disposable(),
    noteAura: disposable(),
    roadGuides: disposable(),
    noteLights: layer(),
    keyEmission: layer(),
    appearance: disposable(),
    rimLights: disposable(),
    board: disposable(),
    boxes: [],
    free: {
      ...disposable(),
      invalidate: vi.fn(),
      setEnabled: vi.fn(),
      update: vi.fn(),
      camera: new Camera()
    },
    performance: {
      ...disposable(),
      setNotes: vi.fn(),
      setRoad: vi.fn(),
      update: vi.fn(() => 0.8),
      updateInspection: vi.fn(),
      roadScale: 0.75,
      lights: { group: Object.assign(new Group(), { visible: false }), setStageLayout: vi.fn() },
      invalidate: vi.fn(),
      getDuration: () => 154.5,
      camera: new Camera()
    },
    worldStage: {
      ...disposable(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      setDuration: vi.fn(),
      setBassNotes: vi.fn(),
      setSign: vi.fn(),
      prepare: vi.fn(),
      ready: true,
      update: vi.fn()
    },
    cabinet: { ...disposable(), clear: vi.fn() },
    top: disposable(),
    white: { ...disposable(), map: disposable() },
    black: { ...disposable(), bumpMap: disposable() },
    case: disposable(),
    felt: disposable(),
    keyboard: disposable()
  });
  const scene = {
    version: 1,
    pan: 0,
    offset: { x: 0, y: 0 },
    camera: { params: { prefs: { scale: 1 } }, near: { y: 22, z: 142 }, roadFarZ: 5142 }
  } as unknown as KeysScene;
  const draw = (delta = 1 / 60, down = false) => {
    stage.draw(scene, {}, () => down, { width: 800, height: 600 }, delta, undefined);
  };
  return { stage, draw, keys, hinge, hands, renderer, geometryDispose, scene };
}

describe("ThreeStage physical key contact", () => {
  it.each([0, 1 / 120, 1 / 60])("applies onset contact in the same frame at delta %s", (delta) => {
    const view = fixture();
    // The contact arrives from LiveHands.update during this frame, not the preceding frame.
    view.hands.update.mockImplementation(() => view.keys.set(60, { drop: 8, along: 90 }));
    view.draw(delta);
    expect(view.hinge.position.y).toBe(-8);
    expect(view.hinge.rotation.x).toBe(0);
  });

  it("restores the same contact after a seek regardless of previous angle or frame duration", () => {
    const view = fixture();
    for (const [previous, delta, drop, along] of [
      [-8, 1 / 120, 2, 30],
      [0, 0, 8, 110],
      [0.03, 1 / 60, 2, 30]
    ] as const) {
      view.hinge.position.y = previous;
      view.keys.set(60, { drop: drop, along: along });
      view.draw(delta);
      expect(view.hinge.position.y).toBe(-drop);
      expect(view.hinge.rotation.x).toBe(0);
    }
  });

  it("keeps ordinary input and release smoothing, and honors a deeper manual press", () => {
    const view = fixture();
    view.draw(1 / 60, true);
    expect(view.hinge.position.y).toBe(-4);
    view.keys.set(60, { drop: 1, along: 0 });
    view.draw(0, true);
    expect(view.hinge.position.y).toBe(-8);
    view.keys.clear();
    view.draw(1 / 60);
    expect(view.hinge.position.y).toBe(-4);
  });

  it("terminates its hand planner and frees stage resources exactly once", () => {
    const view = fixture();
    view.stage.dispose();
    view.stage.dispose();
    expect(view.hands.dispose).toHaveBeenCalledOnce();
    expect(view.renderer.dispose).toHaveBeenCalledOnce();
    expect(view.geometryDispose).toHaveBeenCalledOnce();
  });
});

it("samples pre-render against the configured camera before GPU rendering and bypasses native workers", () => {
  const view = fixture();
  const order: string[] = [];
  const internal = view.stage as unknown as { configureCamera: () => void; roadCamera: Camera };
  internal.configureCamera = () => {
    internal.roadCamera.position.x = 42;
    order.push("camera");
  };
  view.stage.beforeRender = (camera) => {
    expect(camera.position.x).toBe(42);
    order.push("pose");
  };
  view.renderer.render.mockImplementation(() => order.push("render"));
  view.stage.setNativePianist(true);
  view.stage.setNativePianist(true);
  view.keys.set(60, { drop: 8, along: 90 });
  view.draw(0);
  expect(view.hands.suspend).toHaveBeenCalledOnce();
  expect(view.hands.update).not.toHaveBeenCalled();
  expect(view.hinge.rotation.x).toBe(0);
  expect(order).toEqual(["camera", "pose", "render"]);
  view.stage.setNativePianist(false);
  view.draw();
  expect(view.hands.update).toHaveBeenCalledOnce();
});

it.each([false, true])("resets shared Three state after screen FX (failure: %s)", (failure) => {
  const view = fixture();
  const order: string[] = [];
  view.renderer.resetState.mockImplementation(() => order.push("reset"));
  view.renderer.render.mockImplementation(() => order.push("render"));
  const effects = () => {
    order.push("fx");
    if (failure) throw new Error("FX failed");
  };
  const draw = () => {
    view.stage.draw(
      view.scene,
      {},
      () => false,
      { width: 800, height: 600 },
      0,
      undefined,
      [],
      0,
      undefined,
      false,
      undefined,
      effects
    );
  };
  if (failure) expect(draw).toThrow("FX failed");
  else draw();
  expect(order).toEqual(
    failure ? ["reset", "fx", "reset", "reset"] : ["reset", "fx", "reset", "render", "reset"]
  );
  expect(view.renderer.setViewport).toHaveBeenCalledTimes(2);
});

it("keeps free-camera case and native glow in one physical depth pass without screen FX", () => {
  const view = fixture();
  const internal = view.stage as unknown as { scene: Scene; keys: Group; body: Group };
  const board = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const glow = new Mesh(
    new BoxGeometry(),
    new MeshStandardMaterial({ transparent: true, depthTest: true, depthWrite: false })
  );
  internal.body.add(board);
  internal.keys.add(internal.body);
  internal.scene.add(internal.keys, glow);
  const effects = vi.fn();
  view.stage.setFreeCamera(true);
  view.renderer.render.mockImplementation(() => {
    expect(board.visible).toBe(true);
    expect(board.material.colorWrite).toBe(true);
    expect(glow.visible).toBe(true);
    expect(glow.material).toMatchObject({ depthTest: true, depthWrite: false });
  });
  view.stage.draw(
    view.scene,
    {},
    () => false,
    { width: 800, height: 600 },
    0,
    undefined,
    [],
    0,
    undefined,
    true,
    undefined,
    effects
  );
  expect(effects).not.toHaveBeenCalled();
  expect(view.renderer.render).toHaveBeenCalledOnce();
  expect(view.renderer.clearDepth).toHaveBeenCalledOnce();
  board.geometry.dispose();
  board.material.dispose();
  glow.geometry.dispose();
  glow.material.dispose();
});

it("feeds the bass fire the song's notes only when the song's stage asks for it", () => {
  const view = fixture();
  const world = (
    view.stage as unknown as {
      worldStage: { setBassNotes: ReturnType<typeof vi.fn>; setSign: ReturnType<typeof vi.fn> };
    }
  ).worldStage;
  const notes = { left: [{ start: 1, duration: 0.5, pitch: 41 }], right: [] };
  const draw = () => {
    view.stage.draw(
      view.scene,
      {},
      () => false,
      { width: 800, height: 600 },
      1 / 60,
      undefined,
      [],
      1 / 60,
      undefined,
      false,
      notes
    );
  };
  draw();
  expect(world.setBassNotes).toHaveBeenLastCalledWith(undefined);
  view.stage.setSongStage({ sign: "Sample sign", bassFire: true });
  expect(world.setSign).toHaveBeenLastCalledWith("Sample sign");
  draw();
  expect(world.setBassNotes).toHaveBeenLastCalledWith(notes);
  view.stage.setSongStage({ sign: "Sample sign" });
  draw();
  expect(world.setBassNotes).toHaveBeenLastCalledWith(undefined);
});

it("uses the manual camera for the fully lit world without transforming notes or sampling the route", () => {
  const view = fixture();
  const internal = view.stage as unknown as {
    free: { camera: Camera; update: ReturnType<typeof vi.fn> };
    performance: {
      camera: Camera;
      update: ReturnType<typeof vi.fn>;
      updateInspection: ReturnType<typeof vi.fn>;
      lights: { group: Group };
    };
    worldStage: { update: ReturnType<typeof vi.fn> };
    baseLighting: Group;
    roadNotes: { performanceAngle: number; performanceScale: number };
  };
  view.stage.setFreeCamera(true);
  expect(view.stage.nativeEffectsReady).toBe(true);
  expect(internal.baseLighting.visible).toBe(false);
  expect(internal.performance.lights.group.visible).toBe(true);
  view.draw();
  expect(internal.free.update).toHaveBeenCalledOnce();
  expect(internal.performance.update).not.toHaveBeenCalled();
  expect(internal.performance.updateInspection).toHaveBeenCalledWith(
    0,
    expect.any(Group),
    internal.free.camera
  );
  expect(internal.worldStage.update).toHaveBeenLastCalledWith(
    true,
    0,
    expect.any(Group),
    [],
    [],
    internal.free.camera,
    142,
    false,
    undefined,
    true
  );
  expect(internal.roadNotes.performanceAngle).toBe(0);
  expect(internal.roadNotes.performanceScale).toBe(1);
  view.stage.setPerformanceScene(true);
  view.stage.setFreeCamera(false);
  view.draw();
  expect(internal.performance.update).toHaveBeenCalledOnce();
  expect(internal.worldStage.update.mock.calls.at(-1)?.[5]).toBe(internal.performance.camera);
  expect(internal.worldStage.update.mock.calls.at(-1)?.[9]).toBe(false);
  view.stage.setPerformanceScene(false);
  expect(internal.baseLighting.visible).toBe(true);
  expect(internal.performance.lights.group.visible).toBe(false);
  expect(view.stage.nativeEffectsReady).toBe(false);
  view.draw();
  expect(internal.worldStage.update.mock.calls.at(-1)?.[0]).toBe(false);
});
