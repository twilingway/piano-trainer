// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture, TextureSource, TilingSprite } from "pixi.js";

import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";
import { FallingNotesView } from "./FallingNotesView";
import type { FrameState } from "./FallingNotesView";
import { NotesLayer } from "./NotesLayer";
import type { FlatNoteBlocks } from "./FlatNoteBlocks";
import type { KeyboardLayer } from "./KeyboardLayer";
import type { FxLayer } from "./FxLayer";
import { RoadLayer } from "./RoadLayer";
import { worldCamera } from "./worldCamera";

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

function viewHarness(roadMode: boolean, songNotes: readonly SongNote[] = notes) {
  const keyboardDraw = vi.fn<KeyboardLayer["draw"]>();
  const effectsDraw = vi.fn<FxLayer["draw"]>();
  const roadDraw = vi.fn<RoadLayer["draw"]>();
  const { layer, sprites, flatDraw } = notesHarness(songNotes);
  // Exercise frame wiring with real draw(), substituting only the GPU-backed layers.
  const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
    ready: true,
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
    hud: { draw: vi.fn() },
    roadMode,
    keyStyle: "perspective",
    road: {
      draw: roadDraw,
      hitLineY: 400,
      notePlace: (x: number, y: number) => ({ x, y, scale: 1 }),
      beatY: (y: number) => y,
      beginNotes: vi.fn(),
      endNotes: vi.fn(),
      drawHold: vi.fn(() => false),
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
      hands: new Set(["right"])
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
      hands: new Set(["right"])
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
  it.each([false, true])("extends only the visual preview with road=%s", (roadMode) => {
    const { view, notesDraw } = viewHarness(roadMode);
    view.draw({
      time: 0.1,
      lookAhead: 2,
      statusOf: () => undefined,
      pressed: new Set(),
      sounding: new Set(),
      due: [],
      hands: new Set(["right"])
    });
    expect(notesDraw.mock.calls[0]?.[0].lookAhead).toBe(roadMode ? 8 : 2);
    expect(notesDraw.mock.calls[0]?.[0].time).toBe(0.1);
  });
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
        hands: new Set(["right"])
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
      hands: new Set(["right"])
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
