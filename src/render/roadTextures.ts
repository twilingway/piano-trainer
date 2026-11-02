import { type Graphics, Texture } from "./flatThree";

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

/** The optional legacy far edge; the near edge belongs to the mist. */
export function drawRoadHorizon(line: Graphics, y: number, width: number): void {
  const color = 0x3fd6ff;
  for (let step = 1; step <= 6; step++) {
    line.rect(0, y - step, width, step + step * 4).fill({ color, alpha: 0.018 });
  }
  line.rect(0, y - 1.5, width, 3).fill({ color, alpha: 0.18 });
  line.rect(0, y - 0.5, width, 1).fill({ color, alpha: 0.6 });
}
