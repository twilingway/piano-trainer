import type { Finger, Hand } from "../fingering/fingering";

/** A drawn hand pose: the right hand, with its fingertips in the picture's pixels. */
export interface PoseSprite {
  readonly id: string;
  readonly tips: Readonly<Record<Finger, { readonly x: number; readonly y: number }>>;
  /** Fingers the picture shows pressing. */
  readonly pressed: ReadonlySet<Finger>;
  /** This picture's calibrated pixels per white key; older poses use the fit fallback. */
  readonly pixelsPerKey?: number;
}

/** Where a pose goes on screen: which picture, its scale, and where its origin lands. */
export interface PoseFit {
  readonly pose: PoseSprite;
  /** Screen pixels per picture pixel; negative x mirrors the right hand into the left. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Screen x of the picture's x = 0. */
  readonly x: number;
  /** How far, in screen pixels, the placed fingertips miss their keys in total. */
  readonly miss: number;
}

/** A placed finger the picture does not show pressing costs this share of a white key. */
const UNPRESSED_PENALTY = 0.5;

/**
 * The pose whose fingertips land nearest the keys the hand plays, and where to
 * put it. Each pose uses its measured pixels per white key, falling back to
 * `pixelsPerKey` for older pictures. The picture only slides along the keyboard;
 * its proportions are never stretched to fit the targets.
 */
export function fitPose(
  poses: readonly PoseSprite[],
  hand: Hand,
  targets: ReadonlyMap<Finger, number>,
  whiteWidth: number,
  pixelsPerKey: number
): PoseFit | undefined {
  // Also refuses NaN: a pose measured wrong must not place a hand nowhere.
  if (targets.size === 0 || !Number.isFinite(whiteWidth) || !(whiteWidth > 0)) return undefined;
  for (const x of targets.values()) if (!Number.isFinite(x)) return undefined;
  let best: PoseFit | undefined;
  for (const pose of poses) {
    const calibration = pose.pixelsPerKey ?? pixelsPerKey;
    if (!Number.isFinite(calibration) || !(calibration > 0)) continue;
    if (Object.values(pose.tips).some((tip) => !Number.isFinite(tip.x) || !Number.isFinite(tip.y)))
      continue;
    const scale = whiteWidth / calibration;
    if (!Number.isFinite(scale) || !(scale > 0)) continue;
    const scaleX = hand === "right" ? scale : -scale;
    let shift = 0;
    for (const [finger, x] of targets) shift += x - pose.tips[finger].x * scaleX;
    shift /= targets.size;
    let miss = 0;
    for (const [finger, x] of targets) {
      miss += Math.abs(pose.tips[finger].x * scaleX + shift - x);
      if (!pose.pressed.has(finger)) miss += whiteWidth * UNPRESSED_PENALTY;
    }
    if (Number.isFinite(shift) && Number.isFinite(miss) && (!best || miss < best.miss))
      best = { pose, scaleX, scaleY: scale, x: shift, miss };
  }
  return best;
}

/** Picture pixels per white key: in the five-finger pose the fingers 2 to 5 sit a key apart. */
export function pixelsPerKey(five: PoseSprite): number {
  return (five.tips[5].x - five.tips[2].x) / 3;
}
