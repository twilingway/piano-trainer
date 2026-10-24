import { Texture, BoxGeometry, Camera, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import type { KeysScene } from "../NativeKeyboardScene";
import { ThreeStage } from "./ThreeStage";
import { ThreeRoadFrame } from "./ThreeRoadFrame";

/** Exercise the actual frame method with GPU rendering isolated, including its contact ordering. */
function fixture() {
  const hinge = new Group();
  const geometryDispose = vi.fn();
  const mesh = { geometry: { dispose: geometryDispose } } as unknown as Mesh;
  const renderer = {
    domElement: { width: 1600, height: 1200 },
    resetState: vi.fn(),
    setViewport: vi.fn(),
    clearDepth: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
  };
  const disposable = () => ({ dispose: vi.fn() });
  const layer = () => ({ ...disposable(), update: vi.fn() });
  const picture = new Texture();
  const stage = Object.create(ThreeStage.prototype) as ThreeStage;
  Object.assign(stage, {
    scorePoster: { draw: vi.fn(), dispose: vi.fn(), setSource: vi.fn() },
    version: 1,
    disposed: false,
    picture,
    keys: new Group(),
    road: new Group(),
    lighting: new Group(),
    baseLighting: new Group(),
    body: new Group(),
    scene: new Scene(),
    roadCamera: new Camera(),
    keyboardCamera: new Camera(),
    hinged: [{ pitch: 60, hinge, mesh }],
    renderer,

    configureCamera: vi.fn(),
    roadNotes: { ...disposable(), setViewport: vi.fn(), setStyle: vi.fn() },
    roadTrails: disposable(),
    noteAura: disposable(),
    roadGuides: { ...disposable(), clear: vi.fn(), update: vi.fn() },
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
      setRoadBounds: vi.fn(),
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
    stage.draw(scene, picture, () => down, { width: 800, height: 600 }, delta, undefined);
  };
  return { stage, picture, draw, hinge, renderer, geometryDispose, scene };
}

describe("ThreeStage physical key contact", () => {
  it.each([false, true])(
    "honors burning in flat and full 3D views after note updates, native=%s",
    (nativeKeyboard) => {
      const view = fixture();
      const aura = { group: new Group(), update: vi.fn() };
      const trails = { group: new Group(), update: vi.fn() };
      aura.update.mockImplementation(() => {
        aura.group.visible = true;
      });
      trails.update.mockImplementation(() => {
        trails.group.visible = true;
      });
      const notes = { setViewport: vi.fn(), update: vi.fn(), setStyle: vi.fn() };
      const keys = new Group();
      Object.assign(view.stage, {
        noteAura: aura,
        roadTrails: trails,
        roadNotes: notes,
        roadGuides: { clear: vi.fn() },
        keys
      });
      Object.assign(view.scene, { faces: [], texture: { width: 800, height: 200 } });
      const frame = new ThreeRoadFrame();
      frame.burning = false;
      frame.noteStyle = "glass";
      view.stage.draw(
        view.scene,
        view.picture,
        () => false,
        { width: 800, height: 600 },
        0,
        undefined,
        [],
        0,
        frame,
        false,
        undefined,
        undefined,
        nativeKeyboard,
        { burning: frame.burning, presses: true, musicalNotes: true }
      );
      expect(keys.visible).toBe(nativeKeyboard);
      expect(aura.group.visible).toBe(false);
      expect(trails.group.visible).toBe(false);
      expect(notes.update).toHaveBeenCalledOnce();
      frame.burning = true;
      view.stage.draw(
        view.scene,
        view.picture,
        () => false,
        { width: 800, height: 600 },
        0,
        undefined,
        [],
        0,
        frame,
        false,
        undefined,
        undefined,
        nativeKeyboard,
        { burning: frame.burning, presses: true, musicalNotes: true }
      );
      expect(aura.group.visible).toBe(true);
      expect(trails.group.visible).toBe(true);
    }
  );
  it("uses the native contact input and preserves press/release smoothing", () => {
    const view = fixture();
    view.draw(1 / 60, true);
    expect(view.hinge.position.y).toBe(-4);
    view.draw(1 / 60, true);
    expect(view.hinge.position.y).toBe(-6);
    view.draw(1 / 60);
    expect(view.hinge.position.y).toBe(-3);
    expect(view.hinge.rotation.x).toBe(0);
  });

  it("frees stage resources exactly once without a legacy hand planner", () => {
    const view = fixture();
    view.stage.dispose();
    view.stage.dispose();
    expect(view.renderer.dispose).not.toHaveBeenCalled();
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
  view.draw(0);
  expect(view.hinge.rotation.x).toBe(0);
  expect(order).toEqual(["camera", "pose", "render"]);
  expect("hands" in view.stage).toBe(false);
});

it("supplies the performer the physical keyboard camera and restores full-body mode in scene cameras", () => {
  const view = fixture();
  const before = vi.fn();
  view.stage.beforeRender = before;
  Object.assign(view.scene, { keyboardCamera: { ...view.scene.camera } });
  const internal = view.stage as unknown as {
    keyboardCamera: Camera;
    free: { camera: Camera };
    performance: { camera: Camera };
  };
  view.draw();
  expect(before).toHaveBeenLastCalledWith(internal.keyboardCamera, true);
  view.stage.setFreeCamera(true);
  view.draw();
  expect(before).toHaveBeenLastCalledWith(internal.free.camera, false);
  view.stage.setPerformanceScene(true);
  view.draw();
  expect(before).toHaveBeenLastCalledWith(internal.performance.camera, false);
  view.stage.setPerformanceScene(false);
  view.stage.setFreeCamera(false);
  view.draw();
  expect(before).toHaveBeenLastCalledWith(internal.keyboardCamera, true);
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
      view.picture,
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
    view.picture,
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
      view.picture,
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
    true,
    { burning: true, presses: true, musicalNotes: true }
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

it("uses logical viewport dimensions with the application's HiDPI renderer", () => {
  const view = fixture();
  view.draw();
  expect(view.renderer.setViewport).toHaveBeenCalledWith(0, 0, 800, 600);
});

it.each(Array.from({ length: 8 }, (_, mask) => mask))(
  "forwards independent effects into the free-camera world without visible falling notes (%s)",
  (mask) => {
    const view = fixture();
    const effects = { burning: !!(mask & 1), presses: !!(mask & 2), musicalNotes: !!(mask & 4) };
    view.stage.setFreeCamera(true);
    view.stage.draw(
      view.scene,
      view.picture,
      () => false,
      { width: 800, height: 600 },
      0,
      undefined,
      [],
      0,
      undefined,
      true,
      undefined,
      undefined,
      true,
      effects
    );
    const internal = view.stage as unknown as { worldStage: { update: ReturnType<typeof vi.fn> } };
    expect(internal.worldStage.update.mock.lastCall?.[10]).toEqual(effects);
  }
);

it.each(["free", "performance"] as const)(
  "advances the %s world from shared song time while note bodies remain hidden",
  (mode) => {
    const view = fixture();
    const internal = view.stage as unknown as {
      road: Group;
      performance: {
        update: ReturnType<typeof vi.fn>;
        updateInspection: ReturnType<typeof vi.fn>;
      };
      worldStage: { update: ReturnType<typeof vi.fn> };
    };
    if (mode === "free") view.stage.setFreeCamera(true);
    else view.stage.setPerformanceScene(true);
    for (const time of [12, 13.5]) {
      view.stage.draw(
        view.scene,
        view.picture,
        () => false,
        { width: 800, height: 600 },
        1 / 60,
        undefined,
        [],
        1 / 60,
        undefined,
        true,
        undefined,
        undefined,
        true,
        { burning: true, presses: true, musicalNotes: true },
        time
      );
      expect(internal.road.visible).toBe(false);
      expect(internal.worldStage.update.mock.lastCall?.[1]).toBe(time);
      expect(internal.worldStage.update.mock.lastCall?.[8]).toBeUndefined();
      const update =
        mode === "free" ? internal.performance.updateInspection : internal.performance.update;
      expect(update.mock.lastCall?.[0]).toBe(time);
    }
  }
);

it("feeds logical road-key anchors to world effects on a cold scene with hidden native keys", () => {
  const view = fixture();
  Object.assign(view.stage, { freeEnabled: true, roadBoxes: [], roadVersion: -1, boxes: [] });
  Object.assign(view.scene, {
    faces: [{ key: { pitch: 60, black: false, x: 100, width: 44 }, source: { y: 0, height: 200 } }],
    texture: { width: 800, height: 200 },
    native: true,
    camera: { ...view.scene.camera, sourceX: (x: number) => x / 2 }
  });
  const inside = view.stage as unknown as {
    keys: Group;
    worldStage: { prepare: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  view.stage.draw(
    view.scene,
    view.picture,
    () => false,
    { width: 800, height: 600 },
    0.016,
    undefined,
    [{ id: "hit", pitch: 60, color: 0x00df50, strength: 1, progress: 1, sounding: true }],
    0.016,
    undefined,
    true,
    undefined,
    undefined,
    false
  );
  expect(inside.keys.visible).toBe(false);
  const logical = inside.worldStage.prepare.mock.lastCall?.[1] as unknown;
  expect(logical).toMatchObject([{ pitch: 60, x: 61, width: 22 }]);
  expect(inside.worldStage.update.mock.lastCall?.[3]).toBe(logical);
  expect(inside.keys.children).toHaveLength(0);
});

it.each(["filled", "flat", "glass"] as const)(
  "uses only the selected %s body without the old molten shell over solid notes",
  (style) => {
    const view = fixture();
    const aura = { group: new Group(), update: vi.fn() };
    const trails = { group: new Group(), update: vi.fn() };
    const native = { group: new Group(), setStyle: vi.fn(), setViewport: vi.fn(), update: vi.fn() };
    const flat = { group: new Group(), update: vi.fn(), clear: vi.fn() };
    Object.assign(view.stage, {
      noteAura: aura,
      roadTrails: trails,
      roadNotes: native,
      flatRoadNotes: flat,
      roadGuides: { clear: vi.fn() }
    });
    const frame = new ThreeRoadFrame();
    frame.noteStyle = style;
    frame.flatMaterial = style === "flat";
    view.stage.draw(
      view.scene,
      view.picture,
      () => false,
      { width: 800, height: 600 },
      0,
      undefined,
      [],
      0,
      frame
    );
    expect(aura.group.visible).toBe(style === "glass");
    expect(trails.group.visible).toBe(true);
    if (style === "flat") {
      expect(flat.update).toHaveBeenCalledOnce();
      expect(native.group.visible).toBe(false);
      expect(native.update).not.toHaveBeenCalled();
    } else {
      expect(native.setStyle).toHaveBeenCalledExactlyOnceWith(style);
      expect(native.update).toHaveBeenCalledOnce();
      expect(flat.clear).toHaveBeenCalledOnce();
    }
    expect(frame.songTime).toBe(0);
  }
);

it("passes the workspace score source to its structural world poster", () => {
  const { stage } = fixture();
  stage.setWorldScoreSource(undefined);
  const poster = (stage as unknown as { scorePoster: { setSource: ReturnType<typeof vi.fn> } })
    .scorePoster;
  expect(poster.setSource).toHaveBeenCalledWith(undefined);
});
