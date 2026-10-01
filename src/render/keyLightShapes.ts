import { Container, Graphics } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

import { isBlackKey } from "../fingering/fingering";
import type { KeyRect } from "./keyboardLayout";

/** The room round a key's light for its glow, in pixels. */
export const KEY_LIGHT_PAD = 10;

/**
 * A key's outline as the eye sees it from above: a black key is a rectangle;
 * a white key is the full key at the front and narrower at the back, where
 * the black keys beside it cut in.
 */
interface KeyShape {
  readonly width: number;
  readonly height: number;
  /** How far the black keys on either side cut into the back of a white key. */
  readonly cutLeft: number;
  readonly cutRight: number;
  /** How deep those cuts reach: the black keys' length. */
  readonly cutDepth: number;
}

/** The shape of the key at `pitch` among `keys`, `height` long; black keys `blackHeight`. */
export function keyShape(
  pitch: number,
  keys: ReadonlyMap<number, KeyRect>,
  height: number,
  blackHeight: number
): KeyShape | undefined {
  const key = keys.get(pitch);
  if (!key) return undefined;
  if (key.black) {
    return { width: key.width, height: blackHeight, cutLeft: 0, cutRight: 0, cutDepth: 0 };
  }
  const before = isBlackKey(pitch - 1) ? keys.get(pitch - 1) : undefined;
  const after = isBlackKey(pitch + 1) ? keys.get(pitch + 1) : undefined;
  return {
    width: key.width,
    height,
    cutLeft: before ? Math.max(0, before.x + before.width - key.x) : 0,
    cutRight: after ? Math.max(0, key.x + key.width - after.x) : 0,
    cutDepth: blackHeight
  };
}

/** A name for a shape, so keys of one shape share their light. */
export function shapeId(shape: KeyShape): string {
  const round = (value: number) => Math.round(value * 2) / 2;
  return [shape.width, shape.height, shape.cutLeft, shape.cutRight, shape.cutDepth]
    .map(round)
    .join(":");
}

/**
 * A key's light, white for a tint: the key filled with light, brighter towards
 * its front, under a neon edge that follows its outline, the narrow back of a
 * white key included, with a glow round it. Baked once per shape.
 */
export function bakeKeyLight(renderer: Renderer, shape: KeyShape): Texture {
  const pad = KEY_LIGHT_PAD;
  const inset = 2;
  const outline = (g: Graphics) => {
    const { width, height, cutLeft, cutRight, cutDepth } = shape;
    const left = pad + inset;
    const right = pad + width - inset;
    const top = pad + inset;
    const bottom = pad + height - inset;
    const back = pad + cutDepth;
    g.moveTo(left + cutLeft, top)
      .lineTo(right - cutRight, top)
      .lineTo(right - cutRight, cutRight > 0 ? back : top)
      .lineTo(right, cutRight > 0 ? back : top)
      .lineTo(right, bottom)
      .lineTo(left, bottom)
      .lineTo(left, cutLeft > 0 ? back : top)
      .lineTo(left + cutLeft, cutLeft > 0 ? back : top)
      .closePath();
    return g;
  };
  const fill = outline(new Graphics()).fill({ color: 0xffffff, alpha: 0.42 });
  // The front of the key, below the black keys, lit more: the light gathers towards the player.
  const front = new Graphics()
    .roundRect(
      pad + inset * 2,
      pad + shape.cutDepth + (shape.height - shape.cutDepth) * 0.25,
      shape.width - inset * 4,
      (shape.height - shape.cutDepth) * 0.75 - inset * 2,
      4
    )
    .fill({ color: 0xffffff, alpha: shape.cutDepth > 0 ? 0.28 : 0 });
  const root = new Container();
  root.addChild(fill, front);
  // A neon edge: wide and faint outside, then tighter and brighter, then the bright line.
  for (const [width, alpha] of [
    [16, 0.08],
    [10, 0.14],
    [6, 0.3],
    [3, 0.65],
    [1.5, 1]
  ] as const) {
    root.addChild(outline(new Graphics()).stroke({ width, color: 0xffffff, alpha, join: "round" }));
  }
  // Fixed bounds, so every bake of a shape lines up with its key whatever the glow reaches.
  const frame = new Graphics()
    .rect(0, 0, shape.width + pad * 2, shape.height + pad * 2)
    .fill({ color: 0xffffff, alpha: 0.001 });
  root.addChildAt(frame, 0);
  const texture = renderer.generateTexture({ target: root, resolution: renderer.resolution });
  root.destroy({ children: true, context: true });
  return texture;
}
