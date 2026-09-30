/** A point on screen, and how much a small width there is scaled across. */
export interface Projected {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * A camera over the floor the road and the keys lie on. Depth `z` runs from
 * 1 at the view's bottom edge, where the floor spans the view's width, out
 * to the horizon: a point `z` away is `1 / z` the size and `1 / z` of the way
 * from the horizon down to the bottom edge.
 */
export interface FloorCamera {
  /**
   * Screen position and scale of a point `x` across the flat scene, `z`
   * deep, on a floor whose lines meet over `centre` (the view's middle
   * unless given): each octave can have a vanishing point of its own.
   */
  readonly at: (x: number, z: number, centre?: number) => Projected;
}

export function floorCamera(width: number, viewHeight: number, horizonY: number): FloorCamera {
  const middle = width / 2;
  const drop = viewHeight - horizonY;
  return {
    at: (x, z, centre = middle) => ({
      x: centre + (x - centre) / z,
      y: horizonY + drop / z,
      scale: 1 / z
    })
  };
}

/** Depth at a share `t` of the way from `from` to `to`, evenly spaced on the floor. */
export function depthBetween(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
