// @vitest-environment happy-dom
import { NineSliceSprite, Sprite, Texture, TextureSource } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import type { Finger } from "../fingering/fingering";
import { KeyboardLayer } from "./KeyboardLayer";
import type { KeysFrame } from "./KeyboardLayer";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";

const keys: ReadonlyMap<number, KeyRect> = new Map([
  [60, { pitch: 60, black: false, x: 0, width: 40 }],
  [61, { pitch: 61, black: true, x: 28, width: 24 }]
]);
const notes: readonly SongNote[] = [60, 61].map((pitch) => ({
  id: String(pitch),
  pitch,
  start: 0,
  duration: 1,
  startBeat: 0,
  hand: "right",
  finger: 3
}));

function geometry(height: number): Geometry {
  return {
    keyboardTop: 100,
    keyboardHeight: height,
    blackHeight: height * 0.6,
    whiteWidth: 40,
    hitY: 96,
    feltHeight: 4
  };
}

function harness(modelFaces: boolean) {
  const texture = new Texture({ source: new TextureSource({ width: 40, height: 40 }) });
  const digits = new Map<number, Sprite>();
  const keySprites = new Map<number, NineSliceSprite>();
  for (const key of keys.values()) {
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1);
    digits.set(key.pitch, sprite);
    keySprites.set(key.pitch, new NineSliceSprite({ texture: Texture.WHITE }));
  }
  const sticker = new Sprite(Texture.WHITE);
  sticker.position.set(20, 216);
  sticker.scale.set(0.5);
  const layer = Object.assign(Object.create(KeyboardLayer.prototype) as object, {
    modelFaces,
    keySprites,
    keyDigits: digits,
    keyFronts: new Map<number, Sprite>(),
    digitTextures: new Map<Finger, Texture>([[3, texture]]),
    stickerSprites: new Map([[60, sticker]]),
    bevel: { white: 3, black: 3 }
  }) as unknown as KeyboardLayer;
  const frame: KeysFrame = {
    pressed: new Set([60, 61]),
    sounding: new Set(),
    due: [],
    playing: new Map(notes.map((note) => [note.pitch, note])),
    hints: true
  };
  return { layer, digits, frame, sticker };
}

describe("keyboard finger labels", () => {
  it.each([false, true])(
    "preserves glyph proportions on full white and black 3D tops, stickers=%s",
    (stickers) => {
      const run = harness(true);
      for (const height of [110, 180, 320]) {
        const size = geometry(height);
        run.layer.draw(run.frame, keys, size, stickers);
        for (const key of keys.values()) {
          const digit = run.digits.get(key.pitch);
          if (!digit) throw new Error("Expected a key digit");
          const depth = key.black ? 85 : 142;
          const sourceHeight = key.black ? size.blackHeight : size.keyboardHeight;
          const horizontalUvShare = key.black ? 0.84 : 0.86;
          const worldWidth = digit.width / (2 * horizontalUvShare);
          const worldHeight = (digit.height * depth) / sourceHeight;
          expect(worldHeight / worldWidth).toBeCloseTo(1);
          expect(digit.visible).toBe(true);
          if (stickers)
            expect(digit.y - digit.height).toBeCloseTo(
              size.keyboardTop + (key.black ? 0 : size.blackHeight) + 2
            );
          else expect(digit.y).toBe(size.keyboardTop + sourceHeight - 7);
        }
      }
    }
  );

  it.each([false, true])("keeps flat glyph scaling unchanged, stickers=%s", (stickers) => {
    const run = harness(false);
    run.layer.draw(run.frame, keys, geometry(180), stickers);
    for (const digit of run.digits.values()) expect(digit.scale.y).toBe(digit.scale.x);
  });

  it("hides every 3D digit when hints are disabled without hiding stickers", () => {
    const run = harness(true);
    run.layer.draw(run.frame, keys, geometry(180), true);
    expect([...run.digits.values()].every((digit) => digit.visible)).toBe(true);
    run.layer.draw({ ...run.frame, hints: false }, keys, geometry(180), true);
    expect([...run.digits.values()].every((digit) => !digit.visible)).toBe(true);
    expect(run.sticker.visible).toBe(true);
    expect(run.sticker.position).toMatchObject({ x: 20, y: 216 });
    expect(run.sticker.scale).toMatchObject({ x: 0.5, y: 0.5 });
    run.layer.draw(run.frame, keys, geometry(180), true);
    expect([...run.digits.values()].every((digit) => digit.visible)).toBe(true);
  });
});
