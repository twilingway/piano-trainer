// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import type { FrameState } from "./frameState";
import { layoutKeyboard } from "./keyboardLayout";
import { NotePlasma } from "./NotePlasma";
import type { PlasmaLayer } from "./PlasmaLayer";
import { RoadLayer } from "./RoadLayer";
import { Container } from "./flatThree";
import { FallingNotesView } from "./FallingNotesView";
import { flatRoadCamera } from "./flatRoadCamera";
import { panAfterResize } from "./keyboardPan";
import { roadKeyHeights } from "./roadScenePoints";
import type { Geometry } from "./viewGeometry";

const spies = vi.hoisted(() => ({
  draw: vi.fn<PlasmaLayer["draw"]>(),
  clear: vi.fn(),
  destroy: vi.fn()
}));

vi.mock("./PlasmaLayer", async () => {
  const { Container } = await import("./flatThree");
  return {
    PlasmaLayer: class {
      readonly container = new Container();
      readonly mist = new Container();
      readonly draw = spies.draw;
      readonly clear = spies.clear;
      readonly destroy = spies.destroy;
      load(): Promise<void> {
        return Promise.resolve();
      }
    }
  };
});

const note: SongNote = {
  id: "held-note",
  pitch: 60,
  start: 2,
  duration: 1,
  startBeat: 4,
  hand: "right",
  finger: 1
};

const geometry: Geometry = {
  hitY: 300,
  keyboardTop: 310,
  keyboardHeight: 140,
  blackHeight: 90,
  whiteWidth: 20,
  feltHeight: 10
};
const keys = layoutKeyboard(1040);

function frame(overrides: Partial<FrameState> = {}): FrameState {
  return {
    playing: true,
    effectEpoch: 0,
    time: 2,
    lookAhead: 2,
    pressed: new Set([60]),
    sounding: new Set(),
    statusOf: () => "hit",
    owns: () => true,
    due: [],
    hands: new Set(["right"]),
    ...overrides
  };
}

function setup() {
  const effect = new NotePlasma();
  const road = {
    hitLineY: 400,
    drawsNativeRoad: false,
    mistOffsetX: 0,
    notePlace: vi.fn((x: number, y: number) => ({ x: x + 10, y: y - 20, scale: 0.5 })),
    setEnergy: vi.fn<RoadLayer["setEnergy"]>(),
    clearEnergy: vi.fn()
  };
  return {
    effect,
    road,
    draw: (state = frame(), notes: readonly SongNote[] = [note], visible = true, delta = 0.016) => {
      effect.draw(state, notes, keys, geometry, road as unknown as RoadLayer, visible, delta);
    }
  };
}

function lastDraw() {
  const call = spies.draw.mock.calls.at(-1);
  if (!call) throw new Error("Expected the plasma renderer to receive a frame");
  return { anchors: call[0], sources: call[1], attacks: call[2], height: call[3], delta: call[4] };
}

beforeEach(() => vi.clearAllMocks());

describe("NotePlasma renderer integration", () => {
  it.each([false, true])("applies mist placement once with native road=%s", (native) => {
    const view = setup();
    view.road.drawsNativeRoad = native;
    view.road.mistOffsetX = native ? 0 : 100;
    view.road.notePlace.mockImplementation((x, y) => ({
      x: x + 10 + (native ? 100 : 0),
      y: y - 20,
      scale: 0.5
    }));
    view.draw();
    const call = spies.draw.mock.calls.at(-1);
    expect(call?.[6]).toBe(native ? 0 : 100);
    expect(call?.[0][0]?.x).toBeCloseTo(
      (keys.values().next().value?.width ?? 0) / 2 + 10 + (native ? 100 : 0)
    );
    view.effect.destroy();
  });

  it("keeps native energy and legacy plasma until the scene pass owns effect readiness", () => {
    const view = setup();
    view.road.drawsNativeRoad = true;
    view.draw();
    expect(view.road.setEnergy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ pitch: 60 })]),
      0.016
    );
    // Native road readiness alone cannot hide effects: the world atlases may still be loading.
    expect(view.effect.container.visible).toBe(true);
    expect(spies.draw).toHaveBeenCalledOnce();
    expect(view.road.notePlace).toHaveBeenCalled();
    view.road.drawsNativeRoad = false;
    view.draw();
    expect(view.effect.container.visible).toBe(true);
    expect(spies.draw).toHaveBeenCalledTimes(2);
    view.effect.destroy();
  });
  it("freezes a paused frame without consuming its attack, then emits once on resume", () => {
    const { draw, road } = setup();
    draw(frame({ playing: false }));
    expect(lastDraw()).toMatchObject({ delta: 0, attacks: [] });
    expect(lastDraw().sources).toMatchObject([{ id: note.id, sounding: true }]);
    expect(road.setEnergy).toHaveBeenLastCalledWith(lastDraw().sources, 0);

    draw();
    expect(lastDraw().delta).toBe(0.016);
    expect(lastDraw().attacks.map((attack) => attack.id)).toEqual([note.id]);
    draw();
    expect(lastDraw().attacks).toEqual([]);
  });

  it("keeps held flame emission alive while wait mode freezes song time", () => {
    const { draw, road } = setup();
    const waiting = frame({
      playing: true,
      waitingFor: [{ ...note, id: "pending-chord", pitch: 64 }]
    });
    draw(waiting);
    draw(waiting);
    expect(lastDraw().delta).toBeGreaterThan(0);
    expect(lastDraw().sources).toMatchObject([{ id: note.id, sounding: true, strength: 1 }]);
    expect(lastDraw().attacks).toEqual([]);
    expect(road.setEnergy).toHaveBeenLastCalledWith(lastDraw().sources, 0.016);
  });

  it("clears particles, attack identities and road light on an explicit short seek", () => {
    const { draw, road } = setup();
    draw(frame({ effectEpoch: 4 }));
    const layerClears = spies.clear.mock.calls.length;
    const roadClears = road.clearEnergy.mock.calls.length;
    draw(frame({ time: 2.1, effectEpoch: 5 }));
    expect(spies.clear).toHaveBeenCalledTimes(layerClears + 1);
    expect(road.clearEnergy).toHaveBeenCalledTimes(roadClears + 1);
    expect(lastDraw().attacks.map((attack) => attack.id)).toEqual([note.id]);
    draw(frame({ time: 2.12, effectEpoch: 5 }));
    expect(lastDraw().attacks).toEqual([]);
  });

  it("accepts the same note identity after a new song clears the effect", () => {
    const { draw, effect } = setup();
    draw();
    draw();
    expect(lastDraw().attacks).toEqual([]);
    effect.clear();
    draw(frame({ time: 2, effectEpoch: 0 }), [{ ...note, finger: 3 }]);
    expect(lastDraw().attacks).toMatchObject([{ id: note.id, color: FINGER_COLOR[3] }]);
  });

  it("clears both renderers when hidden and resumes with fresh attacks", () => {
    const { draw, road, effect } = setup();
    draw();
    const draws = spies.draw.mock.calls.length;
    const clears = spies.clear.mock.calls.length;
    const roadClears = road.clearEnergy.mock.calls.length;
    draw(frame(), [note], false);
    expect(effect.container.visible).toBe(false);
    expect(spies.draw).toHaveBeenCalledTimes(draws);
    expect(spies.clear).toHaveBeenCalledTimes(clears + 1);
    expect(road.clearEnergy).toHaveBeenCalledTimes(roadClears + 1);
    draw();
    expect(effect.container.visible).toBe(true);
    expect(lastDraw().attacks).toHaveLength(1);
  });

  it("projects every white and black key and preserves each note's finger color in both renderers", () => {
    const { draw, road } = setup();
    const blackNote: SongNote = { ...note, id: "black-note", pitch: 61, finger: 5 };
    draw(frame({ pressed: new Set([60, 61]) }), [note, blackNote]);
    const rendered = lastDraw();
    expect(rendered.anchors).toHaveLength(88);
    expect(rendered.anchors.filter((anchor) => anchor.black)).toHaveLength(36);
    expect(rendered.anchors.filter((anchor) => !anchor.black)).toHaveLength(52);
    const key = keys.get(61);
    if (!key) throw new Error("Expected a black piano key");
    expect(rendered.anchors.find((anchor) => anchor.pitch === 61)).toMatchObject({
      black: true,
      x: key.x + key.width / 2 + 10,
      y: geometry.hitY - 20,
      width: key.width * 0.5
    });
    expect(rendered.sources).toMatchObject([
      { id: note.id, color: FINGER_COLOR[1], sounding: true },
      { id: blackNote.id, color: FINGER_COLOR[5], sounding: true }
    ]);
    expect(road.setEnergy).toHaveBeenLastCalledWith(rendered.sources, rendered.delta);
    expect(rendered.height).toBe(400);
  });
});

it("retains energy and consumes attacks while both screen animations are disabled", () => {
  const view = setup();
  const options = { burning: false, presses: true, musicalNotes: false };
  view.effect.draw(
    frame(),
    [note],
    keys,
    geometry,
    view.road as unknown as RoadLayer,
    true,
    0.016,
    options
  );
  expect(view.effect.container.visible).toBe(false);
  expect(view.road.setEnergy).toHaveBeenCalled();
  expect(lastDraw().attacks).toHaveLength(1);
  view.effect.draw(
    frame(),
    [note],
    keys,
    geometry,
    view.road as unknown as RoadLayer,
    true,
    0.016,
    { ...options, musicalNotes: true }
  );
  expect(view.effect.container.visible).toBe(true);
  expect(lastDraw().attacks).toHaveLength(0);
  view.effect.destroy();
});

it.each([false, true])(
  "keeps flat flame anchors through resize, starting on road=%s",
  (startsOnRoad) => {
    const effect = new NotePlasma();
    const total = 1040;
    const keysRoot = new Container();
    const notesRoot = new Container();
    const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
      style: "classic",
      pan: 6,
      hitY: geometry.hitY,
      keyHeights: roadKeyHeights(keys, true),
      keys: { container: new Container(), draw: vi.fn() },
      clearEnergy: vi.fn()
    }) as unknown as RoadLayer;
    const state = frame();
    const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
      total,
      pan: 16,
      panSnap: startsOnRoad,
      whiteWidth: geometry.whiteWidth,
      keys,
      songNotes: [note],
      app: { ticker: { deltaMS: 16 } },
      placement: { x: 0, y: 0 },
      keysFloor: 100,
      keysRoot,
      notesLayer: { root: notesRoot, cards: new Container() },
      hands: { container: new Container() },
      roadMode: startsOnRoad,
      road
    }) as unknown as {
      scroll: (state: FrameState, width: number) => void;
      roadMode: boolean;
      pan: number;
    };
    let previousWidth = 800;
    for (const [roadMode, width] of [
      [startsOnRoad, 800],
      [false, 700],
      [false, 1200],
      [false, 800]
    ] as const) {
      const camera = flatRoadCamera(width, 600, geometry.hitY, roadMode, 0.1);
      Object.assign(road, {
        camera: camera.notes,
        projection: camera.notes.road,
        blackLane: camera.blackLane,
        size: { width: total, height: geometry.hitY }
      });
      view.roadMode = roadMode;
      view.pan = panAfterResize(view.pan, { width: previousWidth, total }, { width, total });
      view.scroll(state, width);
      effect.draw(state, [note], keys, geometry, road, true, 0.016);
      if (!roadMode) {
        expect(Math.abs(notesRoot.x)).toBeGreaterThan(0);
        for (const pitch of [60, 61]) {
          const key = keys.get(pitch);
          const anchor = lastDraw().anchors.find((candidate) => candidate.pitch === pitch);
          if (!key || !anchor) throw new Error("Missing white or black flame anchor");
          expect(anchor.black).toBe(pitch === 61);
          expect(anchor.x).toBeCloseTo(key.x + key.width / 2 + notesRoot.x);
          expect(anchor.x).toBeCloseTo(key.x + key.width / 2 + keysRoot.x);
          expect(anchor.y).toBeCloseTo(geometry.hitY);
          expect(anchor.width).toBeCloseTo(key.width);
        }
      }
      previousWidth = width;
    }
    effect.destroy();
  }
);
