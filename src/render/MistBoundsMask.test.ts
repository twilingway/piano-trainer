// @vitest-environment happy-dom
import { Container, Sprite } from "./flatThree";
import { describe, expect, it, vi } from "vitest";
import { MistBoundsMask } from "./MistBoundsMask";
import { layoutKeyboard } from "./keyboardLayout";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { CAMERA_PRESETS } from "./worldCamera";

function maskSprite(container: Container): Sprite {
  const sprite = container.mask;
  if (!(sprite instanceof Sprite)) throw new Error("Expected a sprite alpha mask");
  return sprite;
}

describe("native neutral mist keybed bounds", () => {
  it("fits actual projected white keys for every range, piano angle, pan, resize and detached offset", () => {
    const container = new Container();
    const mask = new MistBoundsMask(container);
    for (const count of [25, 49, 61, 88])
      for (const width of [390, 1440])
        for (const prefs of [CAMERA_PRESETS.top, CAMERA_PRESETS.player])
          for (const pan of [0, 240])
            for (const offset of [-60, 0, 90]) {
              const keys = layoutKeyboard(1600, 21, 21 + count - 1);
              const camera = roadLayoutCamera(width, 1600, 700, prefs, true, 0.1);
              const anchors = [...keys.values()].map((key) => {
                const point = camera.project(camera.sourceX(key.x + key.width / 2 - pan), 22, 142);
                return {
                  pitch: key.pitch,
                  black: key.black,
                  x: point.x,
                  y: point.y,
                  width: key.width * point.scale,
                  color: 0xffffff
                };
              });
              mask.update(anchors, 700, true, offset);
              const sprite = maskSprite(container);
              const whites = anchors.filter((anchor) => !anchor.black);
              const left = Math.min(...whites.map((anchor) => anchor.x - anchor.width / 2));
              const right = Math.max(...whites.map((anchor) => anchor.x + anchor.width / 2));
              expect(sprite.x).toBeCloseTo(left + offset, 7);
              expect(sprite.x + sprite.width).toBeCloseTo(right + offset, 7);
              expect(sprite.renderable).toBe(false);
              expect(sprite.parent).toBe(container);
            }
    mask.destroy();
  });

  it("bakes a smooth inside fade once and clears native masking for classic or invalid geometry", () => {
    const container = new Container();
    const mask = new MistBoundsMask(container);
    const anchors = [{ pitch: 60, x: 100, y: 300, width: 30, color: 0xffffff }];
    mask.update(anchors, 400, true);
    const sprite = maskSprite(container);
    const texture = sprite.texture;
    const pixels: unknown = texture.source.resource;
    if (!(pixels instanceof Uint8Array)) throw new Error("Expected baked mask bytes");
    expect(pixels[0]).toBe(0);
    expect(pixels[4]).toBeGreaterThan(0);
    expect(pixels[4]).toBeLessThan(255);
    expect(pixels[128 * 4]).toBe(255);
    expect(pixels[255 * 4]).toBe(0);
    mask.update(anchors, 400, true, 20);
    expect(maskSprite(container)).toBe(sprite);
    expect(sprite.texture).toBe(texture);
    mask.update(anchors, 400, false);
    expect(container.mask).toBeFalsy();
    mask.update([], 400, true);
    expect(container.mask).toBeFalsy();
    const destroyTexture = vi.spyOn(texture, "destroy");
    mask.destroy();
    expect(container.mask).toBeFalsy();
    expect(sprite.destroyed).toBe(true);
    expect(destroyTexture).toHaveBeenCalledWith(true);
  });
});
