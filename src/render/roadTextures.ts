import { Graphics, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

/** A soft round dot: bright middle, fading edge. */
export function bakeSpark(renderer: Renderer): Texture {
  const dot = new Graphics();
  for (let ring = 6; ring >= 1; ring--) {
    dot.circle(8, 8, ring * 1.3).fill({ color: 0xffffff, alpha: 0.25 });
  }
  const texture = renderer.generateTexture({ target: dot, resolution: 2 });
  dot.destroy();
  return texture;
}

/** A vertical fade, opaque at the top: the fog, tinted the background's colour. */
export function bakeFog(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.55)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, 128);
  return Texture.from(canvas);
}
