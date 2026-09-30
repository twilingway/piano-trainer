/** A point on screen, and how much a small width there is scaled across. */
export interface Projected {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** Corners, clockwise from the top left, as `PerspectiveMesh.setCorners` takes them. */
export type Quad = readonly [number, number, number, number, number, number, number, number];

/**
 * Maps points of a flat `width`×`height` picture onto the quad it is laid
 * on in perspective (a projective map, Heckbert's square-to-quad), so things
 * standing on the picture can be drawn upright where they would land.
 */
export function perspectiveMap(
  width: number,
  height: number,
  quad: Quad
): (x: number, y: number) => Projected {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = det === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const h = det === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const point = (x: number, y: number) => {
    const u = x / width;
    const v = y / height;
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + x0) / w, y: (d * u + e * v + y0) / w };
  };
  return (x, y) => {
    const here = point(x, y);
    const across = point(x + 1, y);
    return { x: here.x, y: here.y, scale: Math.hypot(across.x - here.x, across.y - here.y) };
  };
}
