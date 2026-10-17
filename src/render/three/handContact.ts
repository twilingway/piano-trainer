/** The real key hinge and both kit caps: solver depth is 150 mm for 142 scene units. */
export const KEY_PIVOT_MM = 250;
export const KEY_PIVOT_SCENE = (KEY_PIVOT_MM * 142) / 150;
const DEPTH_SCALE = 142 / 150;
const CAP_HEIGHT = 22;

/** Stage's sine travel at a contact, for one shared front travel / hinge angle. */
export function keyDrive(frontDip: number, along: number): number {
  return frontDip * (1 - along / KEY_PIVOT_MM);
}

/** Actual tilted cap depth at a fixed world-space skin point; negative goals are hover heights. */
export function keySkinDepth(frontDip: number, along: number): number {
  if (frontDip <= 0) return frontDip;
  const sine = Math.min(0.99, frontDip / KEY_PIVOT_SCENE),
    cosine = Math.sqrt(1 - sine * sine);
  return ((KEY_PIVOT_MM - along) * DEPTH_SCALE * sine - CAP_HEIGHT * (1 - cosine)) / cosine;
}

/** Inverse cap plane: a skin depth requests this front sine travel, independent of its along. */
export function keyFrontDip(depth: number, along: number): number {
  const lever = Math.max(1, (KEY_PIVOT_MM - along) * DEPTH_SCALE);
  const half = depth / (lever + Math.sqrt(lever * lever - depth * (2 * CAP_HEIGHT - depth)));
  return (KEY_PIVOT_SCENE * 2 * half) / (1 + half * half);
}

/** Recover the shared front travel from the unchanged public Stage {drop, along} contract. */
export function keyDriveFront(drop: number, sceneAlong: number): number {
  return drop / Math.max(0.001, 1 - sceneAlong / KEY_PIVOT_SCENE);
}
