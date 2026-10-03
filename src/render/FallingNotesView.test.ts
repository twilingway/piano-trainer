// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture, TextureSource, TilingSprite } from "pixi.js";

import type { Hand } from "../fingering/fingering";
import type { SongNote } from "../song/song";
import { FallingNotesView } from "./FallingNotesView";
import type { FrameState } from "./FallingNotesView";
import { NotesLayer } from "./NotesLayer";
import type { KeyboardLayer } from "./KeyboardLayer";
import type { FxLayer } from "./FxLayer";
import type { RoadLayer } from "./RoadLayer";

function notesHarness(songNotes: readonly SongNote[] = notes) {
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
    flatBlocks: { begin: vi.fn(), draw: vi.fn(), end: vi.fn() },
    repeated: new Set<string>(),
    beats: [],
    neonFrames: [],
    cardGlow: Texture.WHITE,
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
  return { layer, sprites };
}

const notes: SongNote[] = [
  { id: "left", pitch: 48, hand: "left", finger: 5, start: 0, startBeat: 0, duration: 1 },
  { id: "right", pitch: 72, hand: "right", finger: 1, start: 0, startBeat: 0, duration: 1 }
];

function viewHarness(roadMode: boolean, songNotes: readonly SongNote[] = notes) {
  const keyboardDraw = vi.fn<KeyboardLayer["draw"]>();
  const effectsDraw = vi.fn<FxLayer["draw"]>();
  const roadDraw = vi.fn<RoadLayer["draw"]>();
  const { layer, sprites } = notesHarness(songNotes);
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
    road: {
      draw: roadDraw,
      hitLineY: 400,
      notePlace: (x: number, y: number) => ({ x, y, scale: 1 }),
      beginNotes: vi.fn(),
      endNotes: vi.fn(),
      scenePan: 0
    },
    wasSounding: new Set<number>()
  }) as unknown as FallingNotesView;
  return { view, keyboardDraw, effectsDraw, roadDraw, sprites };
}

describe("accompaniment fire independent of key colours", () => {
  it("keeps identical digits and names inside the lower end with and without the road", () => {
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
    expect(layouts[0]).toEqual(layouts[1]);
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
