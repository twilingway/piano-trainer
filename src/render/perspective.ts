/** A point on screen, and how much a small width there is scaled across. */
export interface Projected {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * The road as the mockup draws it: one floor seen in perspective, a
 * trapezoid from the hit line, where it spans the view, up to the horizon,
 * where it is `farShare` of that width around the view's middle. Every key's
 * lane runs to a point of its own on the horizon, the lanes fanning out
 * towards the player.
 */
export interface RoadProjection {
  /** Screen-space progress down the road, rather than the compressed source depth. */
  readonly progressAt: (depth: number) => number;
  readonly depthAt: (progress: number) => number;
  /**
   * Screen position and scale of a point `x` across the view and `t` of the
   * way down the lane: 0 at the horizon, 1 at the hit line. Equal steps of
   * `t` close up towards the horizon, as on a real floor. The scale is that of
   * a floor `sizeFarShare` wide at the horizon, which may be deeper than the
   * lanes': notes are born small there whatever the road's shape.
   */
  readonly at: (x: number, t: number) => Projected;
}

/** Undo perspective acceleration so equal time steps cover equal screen distances. */
export function depthAtScreenProgress(
  progress: number,
  nearDepth: number,
  farDepth: number
): number {
  const p = Math.max(0, Math.min(1, progress));
  const denominator = (1 - p) * nearDepth + p * farDepth;
  return denominator > 0 ? (p * farDepth) / denominator : p;
}

export function roadProjection(
  width: number,
  hitY: number,
  horizonY: number,
  farShare: number,
  sizeFarShare = farShare
): RoadProjection {
  const middle = width / 2;
  return {
    progressAt: (depth) => {
      const shrink = 1 / (1 / farShare + (1 - 1 / farShare) * depth);
      return (shrink - farShare) / (1 - farShare);
    },
    depthAt: (progress) => {
      const shrink = farShare + (1 - farShare) * progress;
      return (1 / shrink - 1 / farShare) / (1 - 1 / farShare);
    },
    at: (x, t) => {
      // Depth runs evenly down the lane, from 1 / farShare at the horizon to 1 at the hit line;
      // things shrink as 1 / depth, which is the map PerspectiveMesh draws the lane with.
      const far = 1 / farShare;
      const shrink = 1 / (far + (1 - far) * t);
      const down = (shrink - farShare) / (1 - farShare);
      const sizeFar = 1 / sizeFarShare;
      return {
        x: middle + (x - middle) * shrink,
        y: horizonY + (hitY - horizonY) * down,
        scale: 1 / (sizeFar + (1 - sizeFar) * t)
      };
    }
  };
}

/**
 * Where a screen point lies on a quad drawn in perspective, as (u, v) from 0 to 1 across its
 * top-left, top-right, bottom-right and bottom-left corners: the inverse of the projective map a
 * perspective mesh lays its texture by. Undefined for a degenerate quad.
 */
export function quadPoint(
  x: number,
  y: number,
  quad: readonly [Projected, Projected, Projected, Projected]
): { u: number; v: number } | undefined {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) return undefined;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  // The square-to-quad map [[a, b, c], [d, e, f], [g, h, 1]], inverted by its adjugate.
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  const u = (e - f * h) * x + (c * h - b) * y + (b * f - c * e);
  const v = (f * g - d) * x + (a - c * g) * y + (c * d - a * f);
  const w = (d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d);
  if (Math.abs(w) < 1e-12) return undefined;
  return { u: u / w, v: v / w };
}
