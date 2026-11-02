import type { PointData } from "./math";

/** Filter strength is expressed in logical pixels; texture sampling uses framebuffer pixels. */
export function blurSampleStep(
  strength: number,
  pixelWidth: number,
  pixelHeight: number,
  resolution: number
): PointData {
  return {
    x: (strength * resolution) / (3 * Math.max(1, pixelWidth)),
    y: (strength * resolution) / (3 * Math.max(1, pixelHeight))
  };
}

/** Render targets store premultiplied RGBA; retained CPU images use straight alpha. */
export function unpremultiplyPixels(pixels: Uint8Array): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha === 255) continue;
    for (let channel = 0; channel < 3; channel++) {
      const index = i + channel;
      pixels[index] =
        alpha === 0 ? 0 : Math.min(255, Math.round(((pixels[index] ?? 0) * 255) / alpha));
    }
  }
}
