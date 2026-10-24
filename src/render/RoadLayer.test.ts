import { DEFAULT_FREE_DIRECT_FIELD } from "./freeRoadLayout";
// @vitest-environment happy-dom
import { Container, Graphics, Matrix, Texture } from "./flatThree";
import { describe, expect, it, vi } from "vitest";
import { RoadLayer } from "./RoadLayer";
import type { EnergySource } from "./noteEnergy";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { CAMERA_PRESETS, PANEL_EDGE, worldCamera } from "./worldCamera";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { createNoteLaneProjection } from "./noteLaneProjection";
import { computerGeometry } from "./computerKeyboardLayout";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { layoutKeyboard } from "./keyboardLayout";
import { nativeViewCameras } from "./nativeViewCameras";

function fixture() {
  const frame = new ThreeRoadFrame();
  frame.add(400, 100, 300, 44, 0x20df90, 1, 400, worldCamera(800, 600, undefined, PANEL_EDGE));
  const three = {
    drawsRoad: true,
    setEnergy: vi.fn(),
    setRoadFrame: vi.fn(),
    clearEnergy: vi.fn()
  };
  // Exercise real timing and snapshot wiring without constructing GPU resources.
  const internals = Object.assign(Object.create(RoadLayer.prototype) as object, {
    size: { width: 800, height: 400 },
    nativeRoad: frame,
    style: "3d",
    fallingNoteStyle: "filled",
    three,
    fog: new Container(),
    horizon: new Graphics(),
    arrivals: { container: new Container(), draw: vi.fn() },
    rail: { container: new Container(), draw: vi.fn() },
    keys: { container: new Container() },
    container: new Container(),
    viewWidth: 800,
    hitY: 400,
    effects: new Container(),
    renderer: { render: vi.fn() },
    keysTexture: Texture.EMPTY,
    keysShift: new Matrix(),
    clock: 10
  });
  const layer = internals as unknown as RoadLayer;
  const lane = new Container();
  const keys = new Container();
  return {
    layer,
    internals,
    frame,
    three,
    draw: (delta: number) => {
      layer.draw(lane, keys, [], delta);
    }
  };
}

describe("road decorative time", () => {
  it("keeps shader boiling alive on paused energy while the note geometry and flame time stay fixed", () => {
    const { layer, frame, three, draw } = fixture();
    const sources: readonly EnergySource[] = [
      { id: "held", pitch: 60, color: 0x20df90, strength: 1, progress: 1, sounding: true }
    ];
    const geometry = structuredClone(frame.notes);
    layer.endNotes();
    expect(three.setRoadFrame).toHaveBeenCalledWith(frame);

    layer.setEnergy(sources, 0);
    draw(0.016);
    expect(frame.visualTime).toBeCloseTo(10.016);
    layer.setEnergy(sources, 0);
    draw(0.016);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(three.setEnergy).toHaveBeenLastCalledWith(sources, 0);
    expect(frame.notes).toEqual(geometry);
    expect(frame.noteCount).toBe(1);
  });

  it("advances energy only by its supplied delta, independently of shader time", () => {
    const { layer, three, frame, draw } = fixture();
    layer.setEnergy([], 0.016);
    draw(0.032);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(three.setEnergy).toHaveBeenLastCalledWith([], 0.016);
    layer.setEnergy([], 0);
    draw(0);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(three.setEnergy).toHaveBeenLastCalledWith([], 0);
  });
});

describe("raised native note shell wiring", () => {
  it.each([
    [true, false, 0],
    [true, true, 100],
    [false, false, 100]
  ] as const)(
    "applies only the remaining mist shift, native=%s computer=%s",
    (on, computerKeyboard, expected) => {
      const container = new Container();
      container.x = 100;
      const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
        three: { on },
        style: on ? "3d" : "classic",
        computerKeyboard,
        keys: { container }
      }) as unknown as RoadLayer;
      expect(road.mistOffsetX).toBe(expected);
    }
  );

  it("moves native notes, the hit row and smoke anchors with placement without accumulating offsets", () => {
    const width = 1365,
      height = 768;
    const keys = layoutKeyboard(2288, 21, 108);
    const base = metricKeyboardCamera(width, 2288, height, CAMERA_PRESETS.top, 0.1, keys.values());
    const cameras = nativeViewCameras(base, 150, false, true, height, 0.1, height, height - 8);
    const state = {
      camera: cameras.notes,
      keyboardCamera: cameras.keyboard,
      cameraHeight: height,
      blackLane: cameras.blackLane,
      projection: cameras.notes.road,
      viewWidth: width,
      shape: { horizon: 0.1 },
      notesPerspective: true,
      size: { width: 2288, height: 500 },
      keyHeights: new Map<number, number>(),
      pan: 0,
      three: { on: true, drawsRoad: true },
      keys: { container: new Container() },
      fog: new Container(),
      setPan: vi.fn()
    };
    const road = Object.assign(
      Object.create(RoadLayer.prototype) as object,
      state
    ) as unknown as RoadLayer;
    const before = road.notePlace(width / 2, 500);
    if (!before) throw new Error("Missing initial contact");
    for (const y of [130, 130, -25, 0]) {
      road.setKeysOffset({ x: 31, y });
      const contact = road.notePlace(width / 2, 500);
      expect(contact?.y).toBeCloseTo(before.y + y, 8);
      expect(contact?.x).toBeCloseTo(before.x + 31, 8);
      expect(road.hitLineY).toBeCloseTo(before.y + y, 8);
    }
    expect(state.setPan).toHaveBeenCalledTimes(3);
  });

  it.each(["direct", "perspective"] as const)(
    "keeps black labels, body and consumed anchors on one lane in %s",
    (projection) => {
      const keyboard = worldCamera(800, 600, CAMERA_PRESETS.top);
      const camera = noteProjectionCamera(keyboard, projection, 600);
      const lane = createNoteLaneProjection(camera, keyboard, 34, 800, 800);
      const frame = new ThreeRoadFrame();
      const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
        camera,
        blackLane: lane,
        keyHeights: new Map([[400, 34]]),
        projection: camera.road,
        size: { width: 800, height: 400 },
        pan: 32,
        three: { on: true, drawsRoad: true },
        nativeRoad: frame
      }) as unknown as RoadLayer;
      const contact = road.notePlace(400, 400);
      const key = keyboard.project(keyboard.sourceX(400 - 32), 34, 142);
      expect(contact?.x).toBeCloseTo(key.x, 9);
      expect(contact?.y).toBeCloseTo(key.y, 9);
      expect(road.noteLaneY(400)).toBe(34);
      road.drawHold(400, 100, 300, 26, 0xffcf32, 1, 2, "black");
      road.addTrailAnchor(400, 26, 0xffcf32, 1);
      expect(frame.notes[0]?.lane).toBe(lane);
      expect(frame.trailAnchors[0]?.lane).toBe(lane);
      expect(frame.notes[0]?.bottom).toBeGreaterThan(camera.near.z);
    }
  );
});

describe("inspection key input", () => {
  it("keeps typing keys flat while the same native road draws their notes", () => {
    const freeKeysPointAt = vi.fn();
    const pointAt = vi.fn(() => ({ x: 125, y: 45 }));
    const layout = vi.fn();
    const state = {
      camera: worldCamera(800, 600),
      cameraHeight: 600,
      size: { width: 800, height: 600 },
      viewWidth: 800,
      shape: { horizon: 0.1 },
      notesPerspective: true,
      style: "3d",
      keyboardTop: false,
      pan: 0,
      three: { on: true, sceneCamera: false, freeKeysPointAt, setEnabled: vi.fn() },
      fog: new Container(),
      keys: { container: new Container(), layout, pointAt },
      keysTexture: Texture.EMPTY,
      setPan: vi.fn()
    };
    const layer = Object.assign(
      Object.create(RoadLayer.prototype) as object,
      state
    ) as unknown as RoadLayer;
    const geometry = computerGeometry(600, 800, { notes: true, keys: true, hands: false });
    layer.setKeyboard(new Map([[0, { pitch: 0, black: false, x: 0, width: 800 }]]), geometry);
    const camera = (layer as unknown as { camera: typeof state.camera }).camera;
    expect(camera.params.keyboardDepth).toBeUndefined();
    expect(camera.params.sourceUnits ?? 0.5).toBe(0.5);
    expect(layout).toHaveBeenCalled();
    expect(layer.keysPointAt(200, 250)).toEqual({ x: 200, y: 250 });
    expect(pointAt).not.toHaveBeenCalled();
    expect(freeKeysPointAt).not.toHaveBeenCalled();
    state.three.sceneCamera = true;
    freeKeysPointAt.mockReturnValue({ x: 300, y: 80 });
    expect(layer.keysPointAt(200, 250)).toEqual({ x: 200, y: 250 });
    expect(freeKeysPointAt).not.toHaveBeenCalled();
  });

  it.each([
    { x: 80, y: 20 },
    { x: 90, y: 125 },
    { x: -500, y: 1, pitch: 21 }
  ])("adds the keyboard top once for white and black source hits", (point) => {
    const state = {
      three: { on: true, sceneCamera: false, freeKeysPointAt: vi.fn(() => point) },
      style: "3d",
      keyboardTopY: 400
    };
    const layer = Object.assign(
      Object.create(RoadLayer.prototype) as object,
      state
    ) as unknown as RoadLayer;
    expect(layer.keysPointAt(200, 250)).toEqual({ ...point, y: point.y + 400 });
    state.three.freeKeysPointAt.mockReturnValue(undefined as unknown as typeof point);
    expect(layer.keysPointAt(200, 250)).toBeUndefined();
  });

  it("keeps horizon and mist without the obsolete bubble layer in native 3D and fallback", () => {
    const v = fixture();
    v.draw(0.016);
    expect(v.internals.fog.renderable).toBe(true);
    expect(v.internals.arrivals.container.renderable).toBe(true);
    expect(v.internals.effects.renderable).toBe(true);
    expect("sparks" in v.internals).toBe(false);
    v.three.drawsRoad = false;
    v.draw(0.016);
    expect(v.internals.arrivals.container.renderable).toBe(true);
  });
});

it.each(["classic", "arcade", "3d"] as const)(
  "selects projected flat skin only for piano style %s",
  (style) => {
    const view = fixture();
    Object.assign(view.internals, { style, computerKeyboard: false });
    view.layer.beginNotes();
    expect(view.frame.flatMaterial).toBe(style !== "3d");
    Object.assign(view.internals, { computerKeyboard: true });
    view.layer.beginNotes();
    expect(view.frame.flatMaterial).toBe(false);
  }
);

it.each([
  ["3d", true, true, false, true],
  ["3d", true, true, true, false],
  ["3d", false, true, false, false],
  ["3d", true, false, false, false],
  ["classic", true, true, false, false],
  ["arcade", true, true, false, false]
] as const)(
  "keeps native rail in the pre-key pass for %s, keys=%s notes=%s scene=%s",
  (style, keys, notes, scene, expected) => {
    const view = fixture();
    Object.assign(view.internals, { style });
    Object.assign(view.three, { sceneCamera: scene });
    view.internals.keys.container.visible = keys;
    view.internals.container.visible = notes;
    view.draw(0.125);
    expect(view.internals.rail.draw).toHaveBeenCalledExactlyOnceWith(10.125, 800, 400, expected);
  }
);

it("routes the rail through the road's existing pre-key effect layers", () => {
  const view = fixture();
  const setSceneEffects = vi.fn();
  Object.assign(view.three, { setSceneEffects });
  const fire = new Container();
  view.layer.setSceneEffects([fire]);
  expect(setSceneEffects).toHaveBeenCalledExactlyOnceWith(
    [fire],
    [view.internals.horizon, view.internals.arrivals.container, view.internals.rail.container]
  );
});

it.each(["filled", "flat", "glass"] as const)(
  "applies 3D note style %s without changing flat keyboards or typing",
  (noteStyle) => {
    const view = fixture();
    view.layer.setFallingNoteStyle(noteStyle);
    view.layer.beginNotes();
    expect(view.frame.noteStyle).toBe(noteStyle);
    expect(view.frame.flatMaterial).toBe(noteStyle === "flat");
    Object.assign(view.internals, { style: "classic" });
    view.layer.beginNotes();
    expect(view.frame.noteStyle).toBe("flat");
    Object.assign(view.internals, { style: "arcade" });
    view.layer.beginNotes();
    expect(view.frame.noteStyle).toBe("flat");
    Object.assign(view.internals, { style: "3d" });
    view.layer.beginNotes();
    expect(view.frame.noteStyle).toBe(noteStyle);
    Object.assign(view.internals, { computerKeyboard: true });
    view.layer.beginNotes();
    expect(view.frame.noteStyle).toBe("glass");
    expect(view.frame.flatMaterial).toBe(false);
  }
);

it("routes every native note style, trail and CPU origin through the rear contact anchor", () => {
  const { layer, internals, frame, three } = fixture();
  const keys = layoutKeyboard(800, 60, 72);
  const base = metricKeyboardCamera(800, 800, 600, CAMERA_PRESETS.top, 0.1, keys.values());
  const cameras = nativeViewCameras(base, 150, true, true, 600, 0.1, 600);
  Object.assign(internals, {
    camera: cameras.notes,
    keyboardCamera: cameras.keyboard,
    blackLane: cameras.blackLane,
    whiteLane: cameras.whiteLane,
    contactKeys: keys,
    freeRoadLayout: DEFAULT_FREE_DIRECT_FIELD,
    pan: 0,
    projection: cameras.notes.road,
    keyHeights: new Map(
      [...keys.values()].map((key) => [key.x + key.width / 2, key.black ? 34 : 22])
    )
  });
  (layer as unknown as { refreshContactLanes(): void }).refreshContactLanes();
  const c = keys.get(60);
  if (!c) throw new Error("Missing C4");
  const x = c.x + c.width / 2;
  for (const style of ["filled", "glass", "flat"] as const) {
    Object.assign(internals, { fallingNoteStyle: style });
    layer.beginNotes();
    layer.drawHold(x, 100, 400, c.width, 0xffffff, 1, 1, "c4", 0, 60);
    layer.addTrailAnchor(x, c.width, 0xffffff, 1);
    expect(frame.notes[0]?.x).toBeCloseTo(cameras.notes.sourceX(x) - 3.575);
    expect(frame.trailAnchors[0]?.x).toBeCloseTo(frame.notes[0]?.x ?? NaN);
    const expected = cameras.keyboard.project(cameras.keyboard.sourceX(x) - 3.575, 22, 149.1938);
    expect(layer.notePlace(x, 400)?.x).toBeCloseTo(expected.x);
  }
  Object.assign(three, { freeCamera: true });
  layer.beginNotes();
  layer.drawHold(x, 100, 400, c.width, 0xffffff, 1);
  expect(frame.notes[0]?.x).toBeCloseTo(cameras.notes.sourceX(x) - 3.575);
  expect(frame.notes[0]?.lane?.scaleX).toBe(1);
  Object.assign(three, { freeCamera: false });
  Object.assign(internals, { style: "arcade" });
  layer.beginNotes();
  layer.drawHold(x, 100, 400, c.width, 0xffffff, 1);
  expect(frame.notes[0]?.x).toBeCloseTo(cameras.notes.sourceX(x));
});
