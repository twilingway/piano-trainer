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
  /**
   * Screen position and scale of a point `x` across the view and `t` of the
   * way down the lane: 0 at the horizon, 1 at the hit line. Equal steps of
   * `t` close up towards the horizon, as on a real floor.
   */
  readonly at: (x: number, t: number) => Projected;
}

export function roadProjection(
  width: number,
  hitY: number,
  horizonY: number,
  farShare: number
): RoadProjection {
  const middle = width / 2;
  return {
    at: (x, t) => {
      // Depth runs evenly down the lane, from 1 / farShare at the horizon to 1 at the hit line;
      // things shrink as 1 / depth, which is the map PerspectiveMesh draws the lane with.
      const far = 1 / farShare;
      const scale = 1 / (far + (1 - far) * t);
      const down = (scale - farShare) / (1 - farShare);
      return {
        x: middle + (x - middle) * scale,
        y: horizonY + (hitY - horizonY) * down,
        scale
      };
    }
  };
}
