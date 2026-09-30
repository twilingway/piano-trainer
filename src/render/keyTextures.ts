import { Container, FillGradient, Graphics } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";

/**
 * Key faces drawn once per keyboard size, like a real piano's: cream white
 * keys with a rounded front edge, glossy black keys with a lighter front lip.
 * The "lit" black face is the same shape in pale greys, for a tint to colour
 * the key without losing its shape.
 */
export interface KeyTextures {
  readonly white: Texture;
  readonly black: Texture;
  readonly blackLit: Texture;
}

const vertical = (stops: readonly (readonly [number, number])[]) =>
  new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: "local"
  });

function bake(renderer: Renderer, draw: (graphics: Graphics) => void): Texture {
  const graphics = new Graphics();
  draw(graphics);
  const root = new Container();
  root.addChild(graphics);
  const texture = renderer.generateTexture({ target: root, resolution: 2, antialias: true });
  root.destroy({ children: true });
  return texture;
}

function whiteFace(width: number, height: number) {
  return (graphics: Graphics) => {
    const radius = Math.min(width * 0.14, 6);
    graphics.roundRect(0, 0, width, height, radius).fill(
      vertical([
        [0, 0xfbf8ea],
        [0.82, 0xfffef6],
        [0.94, 0xf1ecd8],
        [1, 0xd9d2ba]
      ])
    );
  };
}

function blackFace(width: number, height: number, lit: boolean) {
  return (graphics: Graphics) => {
    const radius = Math.min(width * 0.16, 4);
    const body = lit
      ? [
          [0, 0xd8d8d8],
          [0.85, 0xbdbdbd],
          [1, 0x9a9a9a]
        ]
      : [
          [0, 0x3a3a3e],
          [0.12, 0x1c1c20],
          [0.85, 0x111114],
          [1, 0x050506]
        ];
    graphics.roundRect(0, 0, width, height, radius).fill(vertical(body as [number, number][]));
    // The front lip catches the light.
    const lip = height * 0.1;
    const inset = width * 0.14;
    graphics.roundRect(inset, height - lip - height * 0.03, width - inset * 2, lip, radius).fill(
      vertical(
        lit
          ? [
              [0, 0xf4f4f4],
              [1, 0xcfcfcf]
            ]
          : [
              [0, 0x2a2a2e],
              [1, 0x4a4a50]
            ]
      )
    );
    // A glint down each side.
    graphics
      .rect(inset * 0.5, height * 0.04, 1, height * 0.8)
      .fill({ color: 0xffffff, alpha: lit ? 0.5 : 0.12 });
  };
}

export function bakeKeyTextures(
  renderer: Renderer,
  white: { width: number; height: number },
  black: { width: number; height: number }
): KeyTextures {
  const w = Math.max(white.width, 2);
  const bw = Math.max(black.width, 2);
  return {
    white: bake(renderer, whiteFace(w, Math.max(white.height, 2))),
    black: bake(renderer, blackFace(bw, Math.max(black.height, 2), false)),
    blackLit: bake(renderer, blackFace(bw, Math.max(black.height, 2), true))
  };
}
