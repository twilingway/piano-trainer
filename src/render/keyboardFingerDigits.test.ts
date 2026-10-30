import { describe, expect, it } from "vitest";
import { Sprite, Texture, TextureSource } from "./flatThree";
import { placeKeyboardFingerDigit } from "./keyboardFingerDigits";

const geometry = {
  keyboardTop: 100,
  keyboardHeight: 110,
  blackHeight: 68.2,
  whiteWidth: 40,
  hitY: 96,
  feltHeight: 4
};
function digit(pitch: number, width: number, enabled: boolean, stickers = false, native = false) {
  const sprite = new Sprite(new Texture({ source: new TextureSource({ width: 40, height: 40 }) }));
  sprite.anchor.set(0.5, 1);
  placeKeyboardFingerDigit(
    sprite,
    { pitch, black: false, x: 0, width },
    geometry,
    stickers,
    native,
    { white: 3, black: 3 },
    enabled
  );
  return sprite;
}
describe("octave marker band and ordinary finger digits", () => {
  it("reserves the 18px marker and 3px gap only for a wide flat C", () => {
    const off = digit(60, 40, false),
      on = digit(60, 40, true);
    expect(on.y).toBe(off.y);
    expect(on.y - on.height).toBeGreaterThanOrEqual(
      geometry.keyboardTop + geometry.blackHeight + 2 + 18 + 3
    );
    expect(on.height).toBeLessThan(off.height);
    for (const sprite of [off, on]) {
      sprite.texture.destroy(true);
      sprite.destroy();
    }
  });
  it("preserves narrow C, other pitches, full stickers and native paint", () => {
    for (const [pitch, width, stickers, native] of [
      [60, 16.29, false, false],
      [62, 40, false, false],
      [60, 40, true, false],
      [60, 40, false, true]
    ] as const) {
      const off = digit(pitch, width, false, stickers, native),
        on = digit(pitch, width, true, stickers, native);
      expect(on.width).toBe(off.width);
      expect(on.height).toBe(off.height);
      expect(on.y).toBe(off.y);
      for (const sprite of [off, on]) {
        sprite.texture.destroy(true);
        sprite.destroy();
      }
    }
  });
});
