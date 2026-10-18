import { point } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";
import type {
  PerformanceCameraGeometry,
  PerformanceCameraNode as Node
} from "./performanceCameraTypes";
import {
  PERFORMANCE_ROAD_TILT,
  performanceRoadFlightLook,
  performanceRoadPoint
} from "./performanceRoadProjection";
import { performanceRouteAnchors } from "./performanceRouteAnchors";
import { performanceSignPlacement } from "./performanceStageLayout";

/** Shot moments as fractions of the route after the opening; the flight spans 0.37–0.59. */
const SHOTS = {
  frontWide: 0.14,
  sideHands: 0.255,
  flightStart: 0.37,
  flightEnd: 0.59,
  face: 0.705,
  topHands: 0.845,
  final: 1
} as const;
/** Road length fraction, normal offset, sideways offset, FOV, bank and share of the mean speed. */
const ROAD_FLIGHT = [
  [SHOTS.flightStart, 0.04, 140, 0, 48, 0, 0.7],
  [(SHOTS.flightStart + SHOTS.flightEnd) / 2, 0.3, 200, -60, 56, -0.04, 1.2],
  [SHOTS.flightEnd, 0.56, 120, 0, 44, 0.02, 0.9]
] as const;

/**
 * One pass of each kind of shot for a song under a minute: front, side hands, the notes, the
 * face, the hands from above, and a pull-back that holds the pianist with the sign above.
 */
export function performanceShortRoute(
  g: PerformanceCameraGeometry,
  start: number,
  end: number
): Node[] {
  const key = g.keyboard,
    unit = g.unit,
    box = g.bounds;
  const { centre, hands, face, fit, right, portrait, closeTop, lane } = performanceRouteAnchors(g);
  const at = (fraction: number) => start + (end - start) * fraction;
  const node = (
    fraction: number,
    position: CameraPoint,
    target: CameraPoint,
    fov: number,
    shot: string,
    noteAngle = Math.PI / 2
  ): Node => ({ time: at(fraction), position, target, fov, shot, noteAngle });
  const nodes: Node[] = [
    // Nearer than the long route's first wide shot: the rise has only seconds to get there.
    node(
      SHOTS.frontWide,
      point(centre.x + fit * 0.12, centre.y + fit * 0.18, centre.z - fit * 0.88),
      centre,
      50,
      "front-wide"
    ),
    node(SHOTS.sideHands, right, hands, 36, "side-hands")
  ];
  if (lane && g.road) {
    const heroLength = g.road.height * 2.5,
      angle = PERFORMANCE_ROAD_TILT;
    const [first, , last] = ROAD_FLIGHT;
    // The mean speed that covers the travelled road length in the flight's own seconds.
    const meanSpeed =
      (heroLength * (last[1] - first[1])) / Math.max(1e-6, at(last[0]) - at(first[0]));
    for (const [fraction, along, normal, x, fov, bank, share] of ROAD_FLIGHT) {
      const position = performanceRoadPoint(lane, heroLength * along, angle, normal * unit);
      position.x += x * unit;
      const speed = meanSpeed * share,
        velocity = point(0, Math.sin(angle) * speed, -Math.cos(angle) * speed);
      nodes.push({
        ...node(
          fraction,
          position,
          performanceRoadFlightLook(position, velocity, angle, normal * unit, unit),
          fov,
          "notes-flight",
          angle
        ),
        crossing: "through",
        forwardRoad: true,
        roadNormal: normal * unit,
        bank,
        roadScale: 2.5,
        velocity
      });
    }
  } else
    nodes.push(
      node(
        SHOTS.flightStart,
        point(key.x - 160 * unit, key.y + 300 * unit, key.z - 520 * unit),
        hands,
        38,
        "front-low-hands"
      ),
      node(
        SHOTS.flightEnd,
        point(key.x + 160 * unit, key.y + 260 * unit, key.z - 480 * unit),
        hands,
        40,
        "front-low-hands"
      )
    );
  // The last frame is lifted halfway towards the sign's top so both it and the pianist fit.
  const sign = performanceSignPlacement(box, unit);
  const lifted = point(centre.x, (box.min.y + sign.base.y + sign.maxHeight) / 2, centre.z);
  nodes.push(
    node(SHOTS.face, portrait, face, 32, "face"),
    node(SHOTS.topHands, closeTop, hands, 42, "top-hands"),
    node(
      SHOTS.final,
      point(lifted.x, lifted.y + fit * 0.3, centre.z - fit * 1.3),
      lifted,
      48,
      "final-wide"
    )
  );
  return nodes;
}
