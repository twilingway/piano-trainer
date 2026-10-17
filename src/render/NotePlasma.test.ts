// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import type { FrameState } from "./frameState";
import { layoutKeyboard } from "./keyboardLayout";
import { NotePlasma } from "./NotePlasma";
import type { PlasmaLayer } from "./PlasmaLayer";
import type { RoadLayer } from "./RoadLayer";
import type { Geometry } from "./viewGeometry";

const spies = vi.hoisted(() => ({
  draw: vi.fn<PlasmaLayer["draw"]>(),
  clear: vi.fn(),
  destroy: vi.fn()
}));

vi.mock("./PlasmaLayer", async () => {
  const { Container } = await import("pixi.js");
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
    keysOffsetX: 0,
    setMistLayer: vi.fn<RoadLayer["setMistLayer"]>(),
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
  it("clips neutral mist only in native 3D and forwards the detached keyboard offset once", () => {
    const view = setup();
    view.draw();
    expect(spies.draw.mock.calls.at(-1)?.[5]).toBe(false);
    view.road.drawsNativeRoad = true;
    view.road.keysOffsetX = 80;
    view.draw();
    expect(spies.draw.mock.calls.at(-1)?.slice(5)).toEqual([true, 80]);
    view.effect.destroy();
  });

  it("binds the same non-owning mist pass while active and when effects are hidden", () => {
    const view = setup();
    view.draw();
    const first = view.road.setMistLayer.mock.calls[0]?.[0];
    expect(first).toBeDefined();
    view.draw(frame(), [], false);
    expect(view.road.setMistLayer).toHaveBeenLastCalledWith(first);
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
