import type { HandsGeometry } from "./HandsLayer";

/** Hints follow each key surface; whole hands use a rigid plane above the white keys. */
export function handSurface(geometry: HandsGeometry, y: number, reach?: number) {
  const white =
    142 *
    (1 -
      (y - geometry.keyboardTop - geometry.blackHeight) /
        Math.max(1, geometry.keyboardHeight - geometry.blackHeight));
  if (reach === undefined) {
    const whiteTipY =
      geometry.keyboardTop +
      geometry.blackHeight +
      (geometry.keyboardHeight - geometry.blackHeight) * 0.45;
    // Whole-hand pixels use the same half-millimetre scale as camera.sourceX.
    return { height: 24, depth: 78.1 + (whiteTipY - y) / 2 };
  }
  const black = 142 - (85 * (y - geometry.keyboardTop)) / Math.max(1, geometry.blackHeight);
  return { height: 23 + 14 * reach, depth: white + (black - white) * reach };
}
