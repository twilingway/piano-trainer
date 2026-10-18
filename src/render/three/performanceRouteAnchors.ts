import { performanceRoadAnchors, performanceTopPosition } from "./performanceCameraGeometry";
import { distance, point, pointMix } from "./performanceCameraMath";
import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceCameraGeometry } from "./performanceCameraTypes";

export const boundsCentre = (box: CameraBounds): CameraPoint => pointMix(box.min, box.max, 0.5);

/** Shot anchors the long and the short camera routes share, from one posed scene snapshot. */
export function performanceRouteAnchors(g: PerformanceCameraGeometry) {
  const box = g.bounds,
    body = g.avatar,
    key = g.keyboard,
    unit = g.unit;
  const centre = boundsCentre(box),
    actor = boundsCentre(body);
  const span = Math.max(400 * unit, box.max.x - box.min.x),
    reach = Math.max(220 * unit, span * 0.28);
  const hands = point(key.x, key.y + 70 * unit, key.z);
  const face =
    g.face ??
    point(
      actor.x,
      body.max.y - (body.max.y - body.min.y) * 0.12,
      body.min.z + (body.max.z - body.min.z) * 0.3
    );
  const halfFov = (48 * Math.PI) / 360;
  const limitingFov = Math.atan(Math.tan(halfFov) * Math.min(1, g.aspect ?? 1.5));
  const fit = (distance(box.min, box.max) / 2 / Math.sin(limitingFov)) * 1.12;
  const { centre: lane, gap: gapLane } = performanceRoadAnchors(g.road?.lanes ?? []);
  return {
    centre,
    actor,
    reach,
    hands,
    face,
    fit,
    wide: point(centre.x, centre.y + fit * 0.32, centre.z - fit * 1.3),
    revealTarget: point(centre.x, centre.y - fit * 0.055, centre.z),
    right: point(box.max.x + 150 * unit, key.y + 260 * unit, key.z - 80 * unit),
    portrait: point(actor.x, face.y + 35 * unit, body.min.z - reach * 1.5),
    closeTop: performanceTopPosition(
      point(key.x + 100 * unit, key.y + 700 * unit, key.z + 100 * unit),
      g
    ),
    lane,
    gapLane
  };
}
