// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture, TextureSource, TilingSprite } from "pixi.js";

import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";
import { FallingNotesView } from "./FallingNotesView";
import { HandsLayer } from "./HandsLayer";
import type { FrameState } from "./FallingNotesView";
import { NotesLayer } from "./NotesLayer";
import { PIANO_LOOK } from "./noteLook";
import type { FlatNoteBlocks } from "./FlatNoteBlocks";
import type { KeyboardLayer } from "./KeyboardLayer";
import type { FxLayer } from "./FxLayer";
import { RoadLayer } from "./RoadLayer";
import { CAMERA_PRESETS, DEFAULT_CAMERA, worldCamera } from "./worldCamera";
import { layoutKeyboard } from "./keyboardLayout";

function notesHarness(songNotes: readonly SongNote[] = notes) {
  const flatDraw = vi.fn<FlatNoteBlocks["draw"]>();
  const digitTexture = new Texture({ source: new TextureSource({ width: 24, height: 40 }) });
  const nameTexture = new Texture({ source: new TextureSource({ width: 52, height: 22 }) });
  const sprites = songNotes.map((note) => ({
    note,
    beatSeconds: 1,
    body: new TilingSprite({ texture: Texture.WHITE, width: 1, height: 1 }),
    glow: new Sprite(),
    frame: new Sprite(),
    face: new Sprite(),
    badge: new Sprite(),
    digit: new Sprite(digitTexture),
    name: new Sprite(nameTexture)
  }));
  const layer = Object.assign(Object.create(NotesLayer.prototype) as object, {
    playing: new Map<number, SongNote>(),
    arrivals: [],
    cardsOn: false,
    guides: new Container(),
    beatBars: new Container(),
    lane: new Container(),
    flatBlocks: { begin: vi.fn(), draw: flatDraw, end: vi.fn() },
    repeated: new Set<string>(),
    beats: [],
    neonFrames: [],
    cardGlow: Texture.WHITE,
    trailTile: Texture.WHITE,
    noteNames: "ru",
    look: PIANO_LOOK,
    labels: {
      digits: new Map([
        [1, digitTexture],
        [5, digitTexture]
      ]),
      badges: new Map([
        [1, digitTexture],
        [5, digitTexture]
      ]),
      names: new Map()
    },
    notes: sprites
  }) as unknown as NotesLayer;
  return { layer, sprites, flatDraw };
}

const notes: SongNote[] = [
  { id: "left", pitch: 48, hand: "left", finger: 5, start: 0, startBeat: 0, duration: 1 },
  { id: "right", pitch: 72, hand: "right", finger: 1, start: 0, startBeat: 0, duration: 1 }
];

function viewHarness(roadMode: boolean, songNotes: readonly SongNote[] = notes, nativeRoad = true) {
  const keyboardDraw = vi.fn<KeyboardLayer["draw"]>();
  const effectsDraw = vi.fn<FxLayer["draw"]>();
  const roadDraw = vi.fn<RoadLayer["draw"]>();
  const { layer, sprites, flatDraw } = notesHarness(songNotes);
  // Exercise frame wiring with real draw(), substituting only the GPU-backed layers.
  const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
    ready: true,
    parts: { keys: true, notes: true, hands: false },
    app: { screen: { width: 800, height: 600 }, ticker: { deltaMS: 16 } },
    laidOutFor: { width: 800, height: 600 },
    geometry: () => ({ hitY: 400, whiteWidth: 40 }),
    scroll: vi.fn(),
    pan: 0,
    keys: new Map(songNotes.map((note, index) => [note.pitch, { x: index * 80, width: 40 }])),
    notesLayer: layer,
    keyboard: { draw: keyboardDraw },
    hands: { container: { visible: false } },
    fx: { draw: effectsDraw },
    plasma: { draw: vi.fn() },
    hud: { draw: vi.fn() },
    roadMode,
    roadWanted: roadMode,
    directCameraPrefs: CAMERA_PRESETS.top,
    keyStyle: "perspective",
    cameraPrefs: DEFAULT_CAMERA,
    road: {
      drawsNativeRoad: nativeRoad,
      setCamera: vi.fn(),
      draw: roadDraw,
      hitLineY: 400,
      notePlace: (x: number, y: number) => ({ x, y, scale: 1 }),
      beatY: (y: number) => y,
      beginNotes: vi.fn(),
      endNotes: vi.fn(),
      drawHold: vi.fn(() => false),
      fitHoldTop: (_x: number, top: number) => top,
      clarity: () => 1,
      scenePan: 0
    },
    wasSounding: new Set<number>()
  }) as unknown as FallingNotesView;
  const notesDraw = vi.spyOn(layer, "draw");
  return { view, keyboardDraw, effectsDraw, roadDraw, sprites, flatDraw, notesDraw, layer };
}

describe("accompaniment fire independent of key colours", () => {
  it("keeps a struck hold and its label bright until its duration is consumed", () => {
    const note: SongNote = {
      id: "hold",
      pitch: 72,
      hand: "right",
      finger: 1,
      start: 1,
      startBeat: 1,
      duration: 2
    };
    const { view, sprites, flatDraw } = viewHarness(false, [note]);
    const frame: FrameState = {
      time: 0.9,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(["right"]),
      owns: (note) => note.hand === "right"
    };
    view.draw(frame);
    const before = flatDraw.mock.lastCall?.[5];
    view.draw({ ...frame, time: 1.2, statusOf: () => "hit", pressed: new Set([72]) });
    expect(before).toBe(1);
    expect(flatDraw.mock.lastCall?.[5]).toBe(before);
    expect(sprites[0]?.digit.alpha).toBe(1);
    flatDraw.mockClear();
    view.draw({ ...frame, time: 3.1, statusOf: () => "hit" });
    expect(flatDraw).not.toHaveBeenCalled();
    expect(sprites[0]?.digit.visible).toBe(false);
  });
  it.each([false, true])("shows the original road geometry earlier with cards=%s", (cards) => {
    const note: SongNote = {
      id: "early",
      pitch: 72,
      hand: "right",
      finger: 1,
      start: 12,
      startBeat: 12,
      duration: 1
    };
    const { view, sprites, layer } = viewHarness(true, [note]);
    layer.setCards(cards);
    const frame: FrameState = {
      time: 0,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(["right"]),
      owns: (note) => note.hand === "right"
    };
    view.draw({ ...frame, time: 3 });
    expect(sprites[0]?.body.visible).toBe(false);
    for (const time of [4.1, 6, 8, 10, 12]) {
      view.draw({ ...frame, time });
      const body = sprites[0]?.body;
      expect(body?.visible).toBe(true);
      expect((body?.y ?? NaN) + (body?.height ?? NaN)).toBeCloseTo((time - 4) * 50);
      if (cards) expect(sprites[0]?.frame.y).toBeCloseTo((time - 4) * 50);
    }
    expect(frame.time).toBe(0);
    expect(frame.lookAhead).toBe(2);
  });
  it.each([0, 100])("keeps measure lines with notes with handRoom=%s", (handRoom) => {
    const camera = worldCamera(800, 600 - handRoom);
    const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
      camera,
      projection: camera.road,
      size: { width: 800, height: 400 },
      bottom: 600,
      pan: 0,
      keyHeights: new Map()
    }) as unknown as RoadLayer;
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const sourceY = road.beatY(progress * 400);
      const line = camera.road.at(400, sourceY / 400);
      const note = road.notePlace(400, progress * 400);
      expect(line.y).toBeCloseTo(note?.y ?? NaN);
    }
  });
  it("lays a note on the road's own row of the lane, as the arcade road does", () => {
    const camera = worldCamera(800, 600);
    const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
      camera,
      projection: camera.road,
      size: { width: 800, height: 400 },
      bottom: 600,
      pan: 0,
      keyHeights: new Map()
    }) as unknown as RoadLayer;
    // A note slides with the floor under it: same row, same place, whatever its progress.
    for (const progress of [0.1, 0.25, 0.5, 0.75]) {
      const floor = camera.road.at(400, progress);
      expect(road.notePlace(400, progress * 400)?.y).toBeCloseTo(floor.y);
    }
  });
  it.each([false, true])("extends only the visual preview with road=%s", (roadMode) => {
    const { view, notesDraw } = viewHarness(roadMode);
    view.draw({
      time: 0.1,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(["right"]),
      owns: (note) => note.hand === "right"
    });
    expect(notesDraw.mock.calls[0]?.[0].lookAhead).toBe(roadMode ? 8 : 2);
    expect(notesDraw.mock.calls[0]?.[0].time).toBe(0.1);
  });
  it("switches overhead and perspective flight independently without changing musical time", () => {
    const { view, notesDraw } = viewHarness(true);
    Object.assign(view, { keyStyle: "3d", layout: vi.fn() });
    const frame: FrameState = {
      time: 0.1,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(),
      owns: () => false
    };
    for (const [prefs, expected] of [
      [CAMERA_PRESETS.top, 2.22],
      [CAMERA_PRESETS.player, 6],
      [CAMERA_PRESETS.hands, 6],
      [CAMERA_PRESETS.top, 2.22]
    ] as const) {
      view.setCamera(prefs);
      view.draw(frame);
      expect(notesDraw.mock.lastCall?.[0].lookAhead).toBe(expected);
      expect(notesDraw.mock.lastCall?.[0].time).toBe(0.1);
    }
    expect(frame.lookAhead).toBe(2);
  });
  it.each([false, true])("retains computer-keyboard travel with road=%s", (roadMode) => {
    const { view, notesDraw } = viewHarness(roadMode);
    Object.assign(view, {
      keyStyle: "3d",
      cameraPrefs: CAMERA_PRESETS.top,
      computer: { frame: (frame: FrameState) => frame }
    });
    view.draw({
      time: -0.5,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(),
      owns: () => false
    });
    expect(notesDraw.mock.lastCall?.[0].lookAhead).toBe(roadMode ? 8 : 2);
    expect(notesDraw.mock.lastCall?.[0].time).toBe(-0.5);
  });
  it.each([CAMERA_PRESETS.top, CAMERA_PRESETS.player])(
    "keeps legacy travel while the selected 3D host is unavailable at pitch $pitch",
    (prefs) => {
      const { view, notesDraw } = viewHarness(true, notes, false);
      Object.assign(view, { keyStyle: "3d", cameraPrefs: prefs });
      view.draw({
        time: -0.5,
        lookAhead: 2,
        statusOf: () => undefined,
        pressed: new Set(),
        sounding: new Set(),
        due: [],
        hands: new Set(),
        owns: () => false
      });
      expect(notesDraw.mock.lastCall?.[0].lookAhead).toBe(8);
      expect(notesDraw.mock.lastCall?.[0].time).toBe(-0.5);
    }
  );
  it("keeps digits and names inside the lower end with and without the road", () => {
    const layouts = [false, true].map((roadMode) => {
      const { view, sprites } = viewHarness(roadMode);
      view.draw({
        time: 0.1,
        lookAhead: 2,
        statusOf: () => undefined,
        pressed: new Set(),
        sounding: new Set(),
        due: [],
        hands: new Set(["right"]),
        owns: (note) => note.hand === "right"
      });
      return sprites.map(({ body, digit, name }) => {
        expect(digit.visible).toBe(true);
        expect(name.visible).toBe(true);
        expect(digit.anchor.y).toBe(1);
        expect(digit.y).toBeLessThan(body.y + body.height);
        expect(digit.y - digit.height).toBeGreaterThanOrEqual(body.y);
        expect(name.y - name.height).toBeGreaterThanOrEqual(body.y);
        expect(name.width).toBeLessThan(body.width);
        return {
          digitY: digit.y,
          digitHeight: digit.height,
          nameY: name.y,
          nameHeight: name.height
        };
      });
    });
    for (const layout of layouts) expect(layout[0]).toEqual(layout[1]);
  });
  it("keeps the player's finger and fire when accompaniment shares the pitch", () => {
    const songNotes: SongNote[] = [
      { id: "own", pitch: 60, hand: "right", finger: 1, start: 0, startBeat: 0, duration: 2 },
      { id: "auto", pitch: 60, hand: "left", finger: 5, start: 0, startBeat: 0, duration: 1 }
    ];
    const { view, keyboardDraw, effectsDraw } = viewHarness(false, songNotes);
    const frame: FrameState = {
      time: 0.1,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set([60]),
      sounding: new Set([60]),
      due: [],
      hands: new Set(["right"]),
      owns: (note) => note.hand === "right"
    };
    view.draw(frame);
    expect(keyboardDraw.mock.calls[0]?.[0].playing.get(60)?.finger).toBe(1);
    view.draw({ ...frame, time: 1.1, sounding: new Set() });
    expect(effectsDraw.mock.calls[1]?.[1].map((key) => key.pitch)).toEqual([60]);
    view.draw({ ...frame, time: 1.2, sounding: new Set(), pressed: new Set() });
    expect(effectsDraw.mock.calls[2]?.[1]).toHaveLength(0);
  });
  it.each<[Hand, boolean]>([
    ["right", false],
    ["left", false],
    ["right", true],
    ["left", true]
  ])("keeps accompaniment fire when practising %s (road %s)", (hand, roadMode) => {
    const { view, keyboardDraw, effectsDraw, roadDraw } = viewHarness(roadMode);
    const own = notes.find((note) => note.hand === hand);
    const accompaniment = notes.find((note) => note.hand !== hand);
    if (!own || !accompaniment) throw new Error("Missing test hand");
    const frame: FrameState = {
      time: 0.1,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set([own.pitch]),
      sounding: new Set([accompaniment.pitch]),
      due: [],
      hands: new Set([hand]),
      owns: (note) => note.hand === hand,
      graded: [{ pitch: own.pitch, grade: "perfect" }]
    };
    view.draw(frame);
    expect(keyboardDraw.mock.calls[0]?.[0].sounding.size).toBe(0);
    expect(effectsDraw.mock.calls[0]?.[0].map((key: { pitch: number }) => key.pitch)).toEqual([
      own.pitch,
      accompaniment.pitch
    ]);
    expect(effectsDraw.mock.calls[0]?.[1].map((key: { pitch: number }) => key.pitch)).toEqual([
      48, 72
    ]);
    if (roadMode) expect(roadDraw.mock.calls[0]?.[2]).toHaveLength(2);
    view.draw({ ...frame, graded: [] });
    expect(effectsDraw.mock.calls[1]?.[0]).toHaveLength(0);
    expect(effectsDraw.mock.calls[1]?.[1]).toHaveLength(2);
    expect(frame.sounding.has(accompaniment.pitch)).toBe(true);
  });
});

describe("listening", () => {
  const listening: FrameState = {
    time: -0.5,
    lookAhead: 2,
    statusOf: () => undefined,
    pressed: new Set(),
    sounding: new Set(),
    due: [],
    hands: new Set(),
    owns: () => false
  };

  it("draws every note as bright as the player's own", () => {
    const { view, flatDraw } = viewHarness(false);
    view.draw(listening);
    expect(flatDraw.mock.calls.map((call) => call[5])).toEqual([1, 1]);
  });

  it("shows both hands", () => {
    const visual = () => ({ pictures: [], markers: new Map(), front: 0, blend: 1 });
    const poses = new Map<Hand, unknown>();
    const layer = Object.assign(Object.create(HandsLayer.prototype) as object, {
      visuals: new Map([
        ["left", visual()],
        ["right", visual()]
      ]),
      available: [],
      poses,
      notes: {
        left: notes.filter((note) => note.hand === "left"),
        right: notes.filter((note) => note.hand === "right")
      }
    }) as unknown as HandsLayer;
    const keys = new Map(notes.map((note, index) => [note.pitch, { x: index * 80, width: 40 }]));
    const geometry = { keyboardTop: 400, keyboardHeight: 100, blackHeight: 60, whiteWidth: 40 };
    layer.draw(0, 0.016, new Set(), keys as never, geometry, (x, y) => ({ x, y }));
    expect([...poses.keys()]).toEqual(["left", "right"]);
  });
});

describe("keyboard initial centring", () => {
  function panHarness(roadMode: boolean, pitch = 60) {
    const setPan = vi.fn();
    const keysRoot = new Container();
    const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
      total: 2288,
      pan: 0,
      panSnap: false,
      whiteWidth: 44,
      keys: layoutKeyboard(2288),
      songNotes: [{ id: "next", pitch, start: 0, duration: 1 }],
      app: { ticker: { deltaMS: 16 } },
      placement: { x: 0, y: 0 },
      keysFloor: 200,
      keysRoot,
      hands: { container: new Container() },
      roadMode,
      road: { setPan, setKeysOffset: vi.fn() }
    }) as unknown as FallingNotesView;
    const frame: FrameState = {
      time: 0,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(),
      owns: () => true
    };
    const scroll = () => {
      (view as unknown as { scroll: (state: FrameState, width: number) => void }).scroll(
        frame,
        1920
      );
    };
    view.setRange(21, 108);
    return { scroll, setPan, keysRoot };
  }

  it.each([false, true])("centres 88 keys at 1920px with road=%s", (roadMode) => {
    const { scroll, setPan, keysRoot } = panHarness(roadMode);
    scroll();
    scroll();
    // Equal 184px overflow on either side instead of all 368px on the right.
    if (roadMode) expect(setPan).toHaveBeenLastCalledWith(184);
    else expect(keysRoot.x).toBe(-184);
  });

  it("still brings an extreme upcoming key into view", () => {
    const { scroll, setPan } = panHarness(true, 21);
    scroll();
    expect(setPan).toHaveBeenLastCalledWith(0);
  });
});

describe("native hands layout", () => {
  it("keeps keyboard geometry and offset clamp stable when live hands are enabled", () => {
    interface LayoutHarness {
      geometry(height: number): unknown;
    }
    const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
      parts: { keys: true, notes: true, hands: false },
      whiteWidth: 44,
      labels: false,
      rangeFitsViewport: false,
      placement: { lift: 0, scale: 1, x: 0, y: 125 },
      roadMode: true,
      hands: { live: true }
    });
    const before = (view as unknown as LayoutHarness).geometry(610);
    Object.assign(view, { parts: { keys: true, notes: true, hands: true } });
    expect((view as unknown as LayoutHarness).geometry(610)).toEqual(before);
    Object.assign(view, { roadMode: false });
    expect((view as unknown as LayoutHarness).geometry(610)).not.toEqual(before);
  });
});

it("keeps native 3D enabled for direct notes and restores perspective without changing song time", () => {
  const { view, notesDraw } = viewHarness(true);
  const saved = { ...DEFAULT_CAMERA, pitch: 40 };
  Object.assign(view, { keyStyle: "3d", relayout: vi.fn(), cameraPrefs: saved });
  const state: FrameState = {
    time: 5,
    lookAhead: 2,
    statusOf: () => undefined,
    pressed: new Set(),
    sounding: new Set(),
    due: [],
    hands: new Set(),
    owns: () => false
  };
  view.setRoad(false);
  view.draw(state);
  expect(notesDraw.mock.lastCall?.[0].lookAhead).toBe(2.22);
  expect(notesDraw.mock.lastCall?.[3]).toBeDefined();
  view.setRoad(true);
  view.draw(state);
  expect(notesDraw.mock.lastCall?.[0].lookAhead).toBe(6);
  expect(state.time).toBe(5);
});
