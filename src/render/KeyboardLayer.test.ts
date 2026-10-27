// @vitest-environment happy-dom
import { NineSliceSprite, Sprite, Texture, TextureSource } from "./flatThree";
import { describe, expect, it, vi } from "vitest";
import type { SongNote } from "../song/song";
import type { Finger } from "../fingering/fingering";
import { KeyboardLayer } from "./KeyboardLayer";
import type { KeysFrame } from "./KeyboardLayer";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";
import { KEY_LIGHT_PAD, keyShape } from "./keyLightShapes";

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
    "passes explicit lesson badges independently of neutral tint, native=%s",
    (native) => {
      const run = harness(native);
      const draw = vi.fn();
      Object.assign(run.layer, { lessonBadges: { draw } });
      const fingerCues = [
        { noteId: "n", pitch: 60, hand: "right" as const, recommendedFinger: 3 as const }
      ];
      run.layer.draw({ ...run.frame, neutralKeys: true, fingerCues }, keys, geometry(180), false);
      expect(draw).toHaveBeenLastCalledWith(fingerCues, keys, geometry(180), native);
      expect([...run.digits.values()].every((sprite) => !sprite.visible)).toBe(true);
      run.layer.draw(
        { ...run.frame, neutralKeys: true, fingerCues: [], hints: false },
        keys,
        geometry(180),
        false
      );
      expect(draw).toHaveBeenLastCalledWith([], keys, geometry(180), native);
    }
  );
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
          const depth = key.black ? 94.0242 : 150;
          const sourceHeight = key.black ? size.blackHeight : size.keyboardHeight;
          const horizontalUvShare = key.black ? 0.84 : 0.86;
          const worldWidth =
            (digit.width * (key.black ? 13.31152 : 22.5)) / (key.width * horizontalUvShare);
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

describe("flat key light geometry after leaving 3D", () => {
  it.each(["classic", "arcade"] as const)(
    "restores padded masks on white and black %s keys through resize",
    (style) => {
      const run = harness(true);
      const lights = new Map([...keys.keys()].map((pitch) => [pitch, new Sprite()]));
      const textures = new Map<number, Texture>();
      Object.assign(run.layer, { keyFronts: lights, lightOf: textures, style });
      // Native painting explicitly sizes the same sprites to the unpadded key rectangles.
      run.layer.draw(run.frame, keys, geometry(180), false);
      expect(lights.get(60)?.width).toBe(40);
      Object.assign(run.layer, { modelFaces: false });
      for (const height of [180, 110, 320]) {
        const size = geometry(height);
        for (const pitch of keys.keys()) {
          const shape = keyShape(pitch, keys, size.keyboardHeight - 2, size.blackHeight);
          if (!shape) throw new Error("Expected light shape");
          textures.set(
            pitch,
            new Texture({
              source: new TextureSource({
                width: shape.width + KEY_LIGHT_PAD * 2,
                height: shape.height + KEY_LIGHT_PAD * 2
              })
            })
          );
        }
        for (const pressed of [false, true]) {
          run.layer.draw(
            { ...run.frame, pressed: pressed ? run.frame.pressed : new Set(), due: notes },
            keys,
            size,
            false
          );
          for (const key of keys.values()) {
            const light = lights.get(key.pitch);
            const mask = textures.get(key.pitch);
            const digit = run.digits.get(key.pitch);
            if (!light || !mask || !digit) throw new Error("Expected key feedback");
            expect(light.visible).toBe(true);
            expect(light.width).toBe(mask.width);
            expect(light.height).toBe(mask.height);
            // Baked padding and both notch shoulders map back to unchanged key-face coordinates.
            const xAt = (textureX: number) => light.x + (textureX * light.width) / mask.width;
            const yAt = (textureY: number) => light.y + (textureY * light.height) / mask.height;
            expect(xAt(KEY_LIGHT_PAD)).toBeCloseTo(key.x);
            expect(xAt(KEY_LIGHT_PAD + key.width)).toBeCloseTo(key.x + key.width);
            expect(yAt(KEY_LIGHT_PAD)).toBeCloseTo(size.keyboardTop);
            expect(yAt(KEY_LIGHT_PAD + size.blackHeight)).toBeCloseTo(
              size.keyboardTop + size.blackHeight
            );
            expect(digit.x).toBe(key.x + key.width / 2);
            expect(digit.y - digit.height).toBeGreaterThanOrEqual(
              size.keyboardTop + (key.black ? 0 : size.blackHeight)
            );
            expect(digit.y).toBeLessThan(
              size.keyboardTop + (key.black ? size.blackHeight : size.keyboardHeight)
            );
          }
        }
      }
    }
  );
});

it("frees owned keyboard paint once while preserving shared asset faces and digits", () => {
  const texture = () => new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
  const baked = { white: texture(), black: texture(), blackLit: texture() };
  const sharedFace = texture();
  const sharedDigit = texture();
  const light = texture();
  const sticker = texture();
  const owned = [...Object.values(baked), light, sticker];
  const disposals = owned.map((item) => vi.spyOn(item, "destroy"));
  const release = vi.fn();
  const layer = Object.assign(Object.create(KeyboardLayer.prototype) as object, {
    disposed: false,
    paintGeneration: 0,
    bakedTextures: baked,
    painted: { white: sharedFace, black: sharedFace, blackLit: sharedFace },
    keyTextures: baked,
    digitTextures: new Map([[1, sharedDigit]]),
    lightTextures: new Map([["key", light]]),
    stickerSprites: new Map([[60, new Sprite(sticker)]]),
    pointers: { clear: release }
  }) as unknown as KeyboardLayer;
  layer.destroy();
  layer.destroy();
  for (const disposal of disposals) expect(disposal).toHaveBeenCalledOnce();
  expect(sharedFace.destroyed).toBe(false);
  expect(sharedDigit.destroyed).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});

it("lifts painted white and black faces during physical gaps while retaining sound colours", () => {
  const run = harness(false);
  const white = new Texture({ source: new TextureSource({ width: 40, height: 40 }) });
  const black = new Texture({ source: new TextureSource({ width: 40, height: 40 }) });
  const whitePressed = new Texture({ source: new TextureSource({ width: 40, height: 40 }) });
  const blackPressed = new Texture({ source: new TextureSource({ width: 40, height: 40 }) });
  const faceOf = vi.fn((isBlack: boolean, _lit: boolean, down: boolean) =>
    isBlack ? (down ? blackPressed : black) : down ? whitePressed : white
  );
  Object.assign(run.layer, { painted: {}, keyTextures: {}, faceOf });
  const frame = {
    ...run.frame,
    pressed: new Set<number>(),
    sounding: new Set([60, 61]),
    physicalDown: new Set([60, 61])
  };
  run.layer.draw(frame, keys, geometry(180), false);
  const sprites = (run.layer as unknown as { keySprites: Map<number, Sprite> }).keySprites;
  expect(sprites.get(60)?.texture).toBe(whitePressed);
  expect(sprites.get(61)?.texture).toBe(blackPressed);
  run.layer.draw({ ...frame, physicalDown: new Set() }, keys, geometry(180), false);
  expect(sprites.get(60)?.texture).toBe(white);
  expect(sprites.get(61)?.texture).toBe(black);
  expect(frame.sounding).toEqual(new Set([60, 61]));
});
