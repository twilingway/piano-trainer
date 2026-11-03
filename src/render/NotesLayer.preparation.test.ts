import type * as NoteCardsModule from "./noteCards";
// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { NotesLayer } from "./NotesLayer";
import { FallingNotesView } from "./FallingNotesView";
import { PIANO_LOOK } from "./noteLook";
import { bakeCardFace } from "./noteCards";
import type { Renderer } from "./flatThree";
vi.mock("./noteCards", async (original) => {
  const actual = await original<typeof NoteCardsModule>();
  const { RenderTexture } = await import("./flatThree");
  const texture = () => RenderTexture.create({ width: 8, height: 8 });
  return {
    ...actual,
    bakeCardFrame: texture,
    bakeCardGlow: texture,
    bakeTrailTile: texture,
    bakeCardFace: vi.fn(texture)
  };
});
const song: Song = {
  title: "same",
  source: "midi",
  notes: [{ id: "a", pitch: 60, start: 0, startBeat: 0, duration: 1, hand: "right" }],
  duration: 1,
  measures: [],
  beats: []
};
it("reuses only the identical song and look without baking or replacing its sprites", () => {
  const layer = new NotesLayer({} as Renderer, {
    digits: new Map(),
    badges: new Map(),
    names: new Map()
  });
  layer.setSong(song);
  const children = [...layer.cards.children],
    count = vi.mocked(bakeCardFace).mock.calls.length;
  const note = song.notes[0];
  if (!note) throw new Error("Missing note");
  layer.playing.set(60, note);
  layer.arrivals.length = 1;
  layer.setSong(song);
  expect(bakeCardFace).toHaveBeenCalledTimes(count);
  expect(layer.cards.children).toEqual(children);
  expect(layer.playing.size).toBe(0);
  expect(layer.arrivals).toHaveLength(0);
  layer.setSong(song, { ...PIANO_LOOK });
  expect(bakeCardFace).toHaveBeenCalledTimes(count + 1);
  layer.setSong({ ...song, notes: [{ ...note, pitch: 62 }] });
  expect(bakeCardFace).toHaveBeenCalledTimes(count + 2);
  layer.destroy();
});
it("still resets hands and every transient effect on repeated view song assignments", () => {
  const reset = () => ({ clear: vi.fn() });
  const hands = { setSong: vi.fn() },
    notesLayer = { setSong: vi.fn() },
    hud = reset(),
    fx = reset(),
    plasma = reset();
  const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
    hands,
    notesLayer,
    hud,
    fx,
    plasma,
    wasSounding: new Set([60])
  }) as unknown as FallingNotesView;
  view.setSong(song);
  view.setSong(song);
  for (const call of [hands.setSong, notesLayer.setSong, hud.clear, fx.clear, plasma.clear])
    expect(call).toHaveBeenCalledTimes(2);
});
