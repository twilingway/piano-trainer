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
  readonly y: number;
  /** How far, in screen pixels, the placed fingertips miss their keys in total. */
  readonly miss: number;
}

/** A placed finger the picture does not show pressing costs this share of a white key. */
const UNPRESSED_PENALTY = 0.5;
const MIN_STRETCH = 0.8;
const MAX_STRETCH = 1.2;

/** Fits one axis without allowing a whole hand to collapse, invert or grow excessively. */
function fitAxis(points: readonly { source: number; target: number }[], scale: number) {
  if (points.length === 0) return { scale, shift: 0 };
  const sourceMean = points.reduce((sum, point) => sum + point.source, 0) / points.length;
  const targetMean = points.reduce((sum, point) => sum + point.target, 0) / points.length;
  let variance = 0;
  let covariance = 0;
  for (const point of points) {
    variance += (point.source - sourceMean) ** 2;
    covariance += (point.source - sourceMean) * (point.target - targetMean);
  }
  const stretch = variance > 0 ? covariance / variance / scale : 1;
  const fittedScale = scale * Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, stretch));
  return { scale: fittedScale, shift: targetMean - sourceMean * fittedScale };
}

/**
 * The pose whose fingertips land nearest the keys the hand plays, and where to
 * put it. Each pose uses its measured pixels per white key, falling back to
 * `pixelsPerKey` for older pictures. Limited independent axis stretching brings
 * the active fingertips closer to their keys while preserving a recognisable hand.
 */
export function fitPose(
  poses: readonly PoseSprite[],
  hand: Hand,
  targets: ReadonlyMap<Finger, number>,
  whiteWidth: number,
  pixelsPerKey: number,
  targetYs: ReadonlyMap<Finger, number> = new Map()
): PoseFit | undefined {
  // Also refuses NaN: a pose measured wrong must not place a hand nowhere.
  if (targets.size === 0 || !Number.isFinite(whiteWidth) || !(whiteWidth > 0)) return undefined;
  for (const x of targets.values()) if (!Number.isFinite(x)) return undefined;
  for (const y of targetYs.values()) if (!Number.isFinite(y)) return undefined;
  let best: PoseFit | undefined;
  let bestScore = Infinity;
  for (const pose of poses) {
    const calibration = pose.pixelsPerKey ?? pixelsPerKey;
    if (!Number.isFinite(calibration) || !(calibration > 0)) continue;
    if (Object.values(pose.tips).some((tip) => !Number.isFinite(tip.x) || !Number.isFinite(tip.y)))
      continue;
    const scale = whiteWidth / calibration;
    if (!Number.isFinite(scale) || !(scale > 0)) continue;
    const horizontal = fitAxis(
      [...targets].map(([finger, target]) => ({ source: pose.tips[finger].x, target })),
      hand === "right" ? scale : -scale
    );
    const vertical = fitAxis(
      [...targets.keys()].flatMap((finger) => {
        const target = targetYs.get(finger);
        return target === undefined ? [] : [{ source: pose.tips[finger].y, target }];
      }),
      scale
    );
    // Keep every active fingertip at or above its target, never below the keyboard.
    let y = vertical.shift;
    for (const finger of targets.keys()) {
      const target = targetYs.get(finger);
      if (target !== undefined) y = Math.min(y, target - pose.tips[finger].y * vertical.scale);
    }
    let miss = 0;
    for (const [finger, x] of targets) {
      miss += Math.abs(pose.tips[finger].x * horizontal.scale + horizontal.shift - x);
      const targetY = targetYs.get(finger);
      if (targetY !== undefined)
        miss += Math.abs(pose.tips[finger].y * vertical.scale + y - targetY);
      if (!pose.pressed.has(finger)) miss += whiteWidth * UNPRESSED_PENALTY;
    }
    // Prefer an already fitting pose over stretching a neighbouring pose into the same chord.
    const distortion =
      Math.abs(Math.abs(horizontal.scale) / scale - 1) + Math.abs(vertical.scale / scale - 1);
    const score = miss + distortion * whiteWidth;
    if (Number.isFinite(horizontal.shift) && Number.isFinite(score) && score < bestScore) {
      best = {
        pose,
        scaleX: horizontal.scale,
        scaleY: vertical.scale,
        x: horizontal.shift,
        y,
        miss
      };
      bestScore = score;
    }
  }
  return best;
}

/** Picture pixels per white key: in the five-finger pose the fingers 2 to 5 sit a key apart. */
export function pixelsPerKey(five: PoseSprite): number {
  return (five.tips[5].x - five.tips[2].x) / 3;
}
