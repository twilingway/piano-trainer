import { placeKeyboardFingerDigit } from "./keyboardFingerDigits";
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Texture, TextureSource, type Renderer, Sprite, type Text } from "./flatThree";
import {
  lessonLabels,
  KeyboardLabelSettings,
  OctaveKeyLabels,
  keyOctave,
  octaveKeyLabel
} from "./octaveKeyLabels";
import { layoutKeyboard } from "./keyboardLayout";

const geometry = {
  keyboardTop: 100,
  keyboardHeight: 180,
  blackHeight: 108,
  whiteWidth: 40,
  hitY: 96,
  feltHeight: 4
};
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
}

function harness() {
  const texts: string[] = [];
  const destroyCounts: (() => number)[] = [];
  const textures: Texture[] = [];
  const generateTexture = vi.fn(({ target }: { target: Text }) => {
    texts.push(target.text);
    const texture = new Texture({ source: new TextureSource({ width: 60, height: 32 }) });
    const dispose = vi.spyOn(texture, "destroy");
    destroyCounts.push(() => dispose.mock.calls.length);
    textures.push(texture);
    return texture;
  });
  const layer = new OctaveKeyLabels({ generateTexture } as unknown as Renderer);
  return { layer, generateTexture, textures, texts, destroyCounts };
}
describe("octave key labels", () => {
  it("uses the actual MIDI octave only on C", () => {
    expect(keyOctave(60)).toBe(4);
    expect(keyOctave(108)).toBe(8);
    for (const pitch of [21, 59, 61, 60.5, NaN]) expect(keyOctave(pitch)).toBeUndefined();
    expect(octaveKeyLabel(60, "ru")).toBe("C4");
    expect(octaveKeyLabel(108, "en")).toBe("C8");
    expect(octaveKeyLabel(61, "en")).toBeUndefined();
  });
  it.each([false, true])(
    "lays out only existing C keys and clears stale labels, native=%s",
    (native) => {
      const { layer } = harness();
      layer.layout(layoutKeyboard(2080, 21, 108), geometry, native);
      const sprites = layer.container.children as Sprite[];
      expect(sprites.filter((s) => s.visible)).toHaveLength(8);
      expect(sprites.map((s) => s.label)).toEqual(
        [24, 36, 48, 60, 72, 84, 96, 108].map((p) => `octave:${String(p)}`)
      );
      const range = layoutKeyboard(80, 60, 61);
      layer.layout(range, geometry, native);
      const shown = sprites.filter((s) => s.visible);
      expect(shown).toHaveLength(1);
      const c = required(shown[0]);
      expect(c.x).toBeCloseTo(20);
      expect(c.y).toBe(geometry.keyboardTop + geometry.blackHeight + 2);
      expect(c.width).toBeLessThan(40);
      expect(c.y + c.height).toBeLessThan(geometry.keyboardTop + geometry.keyboardHeight - 30);
      layer.layout(new Map(), geometry, native);
      expect(sprites.some((s) => s.visible)).toBe(false);
      layer.destroy();
    }
  );
  it("keeps the independent toggle while full stickers suppress duplicates", () => {
    const { layer } = harness();
    layer.show(true, false);
    expect(layer.container.visible).toBe(true);
    layer.show(true, true);
    expect(layer.container.visible).toBe(false);
    layer.show(true, false);
    expect(layer.container.visible).toBe(true);
    layer.show(false, false);
    expect(layer.container.visible).toBe(false);
    layer.show(false, true);
    expect(layer.container.visible).toBe(false);
    layer.destroy();
  });
  it("bakes both locales once and disposes only owned textures once", () => {
    const { layer, textures, texts, generateTexture, destroyCounts } = harness();
    expect(texts).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `C${String(i + 1)}`),
      ...Array.from({ length: 8 }, (_, i) => `C${String(i + 1)}`)
    ]);
    expect(generateTexture).toHaveBeenCalledTimes(16);
    for (const locale of ["ru", "en"] as const) {
      layer.setLocale(locale);
      layer.layout(layoutKeyboard(320, 60, 72), geometry, false);
      layer.show(true, false);
    }
    expect(generateTexture).toHaveBeenCalledTimes(16);
    layer.destroy();
    layer.destroy();
    expect(textures.every((t) => t.source.destroyed)).toBe(true);
    expect(destroyCounts.every((count) => count() === 1)).toBe(true);
    expect(Texture.WHITE.destroyed).toBe(false);
  });
});

it("retains label choices set before mount and updates mounted targets without changing the other choice", () => {
  const target: {
    current?: { showStickers: (show: boolean) => void; showOctaveLabels: (show: boolean) => void };
  } = {};
  const relayout = vi.fn();
  const settings = new KeyboardLabelSettings(() => [target.current], relayout);
  settings.setOctaves(false);
  expect(settings.octaves).toBe(false);
  expect(settings.labels).toBe(false);
  target.current = { showStickers: vi.fn(), showOctaveLabels: vi.fn() };
  settings.setLabels(true);
  expect(target.current.showStickers).toHaveBeenCalledWith(true);
  expect(settings.octaves).toBe(false);
  settings.setOctaves(true);
  expect(target.current.showOctaveLabels).toHaveBeenCalledWith(true);
  expect(settings.labels).toBe(true);
  expect(relayout).toHaveBeenCalledTimes(3);
});

it("keeps flat octave labels readable in the measured mobile 88-key layout without overlapping adjacent Cs", () => {
  const { layer } = harness();
  const width = 16.29;
  const keys = new Map([
    [60, { pitch: 60, black: false, x: 0, width }],
    [72, { pitch: 72, black: false, x: 7 * width, width }]
  ]);
  const size = { ...geometry, keyboardHeight: 110, blackHeight: 68.2, whiteWidth: width };
  layer.layout(keys, size, false);
  const [first, second] = (layer.container.children as Sprite[]).filter((s) => s.visible);
  expect(first?.height).toBeGreaterThanOrEqual(16);
  expect(first?.height).toBeLessThanOrEqual(18);
  if (!first || !second) throw new Error("Expected both C markers");
  expect(first.x + first.width / 2).toBeLessThan(second.x - second.width / 2);
  expect(first.y + first.height).toBeLessThan(size.keyboardTop + size.keyboardHeight - 3);
  layer.layout(new Map([[60, { pitch: 60, black: false, x: 0, width: 0 }]]), size, true);
  expect(layer.container.children.some((s) => s.visible)).toBe(false);
  layer.destroy();
});

it("keeps native paint inside its key UV and skips a hidden keyboard without NaN", () => {
  const { layer } = harness();
  const key = { pitch: 60, black: false, x: 0, width: 16.29 };
  const keys = new Map([[60, key]]);
  layer.layout(keys, { ...geometry, keyboardHeight: 110, blackHeight: 68.2 }, true);
  const sprite = required((layer.container.children as Sprite[]).find((s) => s.visible));
  expect(sprite.width).toBeLessThanOrEqual(key.width * 0.86);
  layer.layout(keys, { ...geometry, keyboardHeight: 0, blackHeight: 0 }, true);
  expect(layer.container.children.some((s) => s.visible)).toBe(false);
  expect(Number.isFinite(sprite.scale.y)).toBe(true);
  layer.destroy();
});

it.each([false, true])(
  "leaves ordinary C finger digits clear in the measured mobile geometry, native=%s",
  (native) => {
    const { layer } = harness();
    const key = { pitch: 60, black: false, x: 0, width: 16.29 };
    const size = { ...geometry, keyboardHeight: 110, blackHeight: 68.2, whiteWidth: key.width };
    layer.layout(new Map([[60, key]]), size, native);
    const marker = required((layer.container.children as Sprite[]).find((s) => s.visible));
    const hint = new Sprite(new Texture({ source: new TextureSource({ width: 40, height: 40 }) }));
    hint.anchor.set(0.5, 1);
    placeKeyboardFingerDigit(hint, key, size, false, native, { white: 3, black: 3 });
    expect(marker.y + marker.height).toBeLessThan(hint.y - hint.height);
    hint.texture.destroy(true);
    hint.destroy();
    layer.destroy();
  }
);

it("suppresses only an authorized C lesson badge and restores its marker without changing preferences", () => {
  const { layer, generateTexture } = harness();
  const keys = layoutKeyboard(320, 60, 72);
  layer.layout(keys, geometry, false);
  const cues = [{ noteId: "c", pitch: 60, hand: "right" as const, recommendedFinger: 3 as const }];
  const badge = { draw: vi.fn() };
  const c = required(layer.container.children.find((s) => s.label === "octave:60"));
  const next = required(layer.container.children.find((s) => s.label === "octave:72"));
  lessonLabels(badge, layer, { fingerCues: cues, hints: true }, keys, geometry, false);
  expect(badge.draw).toHaveBeenLastCalledWith(cues, keys, geometry, false);
  expect(c.visible).toBe(false);
  expect(next.visible).toBe(true);
  expect(layer.on).toBe(true);
  lessonLabels(badge, layer, { fingerCues: cues, hints: false }, keys, geometry, false);
  expect(badge.draw).toHaveBeenLastCalledWith([], keys, geometry, false);
  expect(c.visible).toBe(true);
  lessonLabels(
    badge,
    layer,
    { fingerCues: [{ ...required(cues[0]), pitch: 61 }] },
    keys,
    geometry,
    false
  );
  expect(c.visible).toBe(true);
  lessonLabels(badge, layer, { fingerCues: cues }, keys, geometry, false);
  expect(c.visible).toBe(false);
  lessonLabels(badge, layer, {}, keys, geometry, false);
  expect(c.visible).toBe(true);
  expect(layer.on).toBe(true);
  expect(generateTexture).toHaveBeenCalledTimes(16);
  layer.destroy();
});
