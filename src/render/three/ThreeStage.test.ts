import { Camera, Group, Scene } from "three";
import type { Mesh } from "three";
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
    free: { ...disposable(), invalidate: vi.fn() },
    performance: {
      ...disposable(),
      setNotes: vi.fn(),
      setRoad: vi.fn(),
      invalidate: vi.fn(),
      getDuration: () => 154.5,
      camera: new Camera()
    },
    worldStage: {
      ...disposable(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      setDuration: vi.fn(),
      update: vi.fn()
    },
    cabinet: { ...disposable(), clear: vi.fn() },
    top: disposable(),
    white: { ...disposable(), map: disposable() },
    black: { ...disposable(), bumpMap: disposable() },
    case: disposable(),
    felt: disposable()
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
  return { stage, draw, keys, hinge, hands, renderer, geometryDispose };
}

const pivot = (250 * 142) / 150;

describe("ThreeStage physical key contact", () => {
  it.each([0, 1 / 120, 1 / 60])("applies onset contact in the same frame at delta %s", (delta) => {
    const view = fixture();
    // The contact arrives from LiveHands.update during this frame, not the preceding frame.
    view.hands.update.mockImplementation(() => view.keys.set(60, { drop: 8, along: 90 }));
    view.draw(delta);
    expect(Math.sin(view.hinge.rotation.x) * (pivot - 90)).toBeCloseTo(8, 12);
  });

  it("restores the same contact after a seek regardless of previous angle or frame duration", () => {
    const view = fixture();
    for (const [previous, delta, drop, along] of [
      [0.15, 1 / 120, 2, 30],
      [0, 0, 8, 110],
      [0.03, 1 / 60, 2, 30]
    ] as const) {
      view.hinge.rotation.x = previous;
      view.keys.set(60, { drop: drop, along: along });
      view.draw(delta);
      expect(Math.sin(view.hinge.rotation.x) * (pivot - along)).toBeCloseTo(drop, 12);
    }
  });

  it("keeps ordinary input and release smoothing, and honors a deeper manual press", () => {
    const view = fixture();
    view.draw(1 / 60, true);
    expect(view.hinge.rotation.x).toBeCloseTo(Math.asin(9 / pivot) / 2, 12);
    view.keys.set(60, { drop: 1, along: 0 });
    view.draw(0, true);
    expect(view.hinge.rotation.x).toBeCloseTo(Math.asin(9 / pivot), 12);
    view.keys.clear();
    view.draw(1 / 60);
    expect(view.hinge.rotation.x).toBeCloseTo(Math.asin(9 / pivot) / 2, 12);
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
