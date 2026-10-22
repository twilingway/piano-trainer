import { point } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";
import type {
  PerformanceCameraGeometry,
  PerformanceCameraNode as Node
} from "./performanceCameraTypes";
import { PERFORMANCE_ROAD_TILT } from "./performanceRoadProjection";
import { SHORT_FRAMING_FOV, performanceShortFraming } from "./performanceShortFraming";

/** Seconds from the top view at the end of the opening to the start of the pass. */
const ARRIVE_SECONDS = 3;
/** The song's last seconds: the camera turns to the sign and flies through it. */
const THROUGH_SECONDS = 4;
/** When the camera starts its straight run at the sign, before the end of the song. */
const APPROACH_SECONDS = 1.2;
/** How far the pass reaches to either side of the middle, in viewing distances. */
const SWING = 0.2;

/**
 * A song under a minute: one slow pass from left to right in front of the playing pianist, the
 * hands, the notes and the giant sign above them all in frame, then a run at the sign and through
 * it. The note road keeps a gentle tilt towards the camera and the camera never flies into it.
 */
export function performanceShortRoute(
  g: PerformanceCameraGeometry,
  start: number,
  end: number
): Node[] {
  const { camera, target, sign } = performanceShortFraming(g.bounds);
  const swing = (target.z - camera.z) * SWING;
  const passStart = start + ARRIVE_SECONDS,
    passEnd = end - THROUGH_SECONDS,
    approach = end - APPROACH_SECONDS;
  const pass = point((2 * swing) / (passEnd - passStart), 0, 0);
  const centre = point(sign.base.x, sign.base.y + sign.maxHeight / 2, sign.base.z),
    reach = centre.z - camera.z;
  const near = point(centre.x, centre.y, centre.z - reach * 0.25),
    behind = point(centre.x, centre.y, centre.z + reach * 0.2);
  // Straight through the plane at one speed: still moving when the song ends.
  const through = point(0, 0, (behind.z - near.z) / APPROACH_SECONDS);
  // Looking past the sign keeps the view steady while the camera crosses it.
  const beyond = point(centre.x, centre.y, centre.z + reach);
  const node = (
    time: number,
    position: CameraPoint,
    look: CameraPoint,
    shot: string,
    velocity: CameraPoint
  ): Node => ({
    time,
    position,
    target: look,
    fov: SHORT_FRAMING_FOV,
    shot,
    noteAngle: PERFORMANCE_ROAD_TILT,
    velocity
  });
  return [
    node(passStart, point(camera.x - swing, camera.y, camera.z), target, "pianist-pass", pass),
    node(passEnd, point(camera.x + swing, camera.y, camera.z), target, "pianist-pass", pass),
    node(approach, near, beyond, "sign-through", through),
    node(end, behind, beyond, "sign-through", through)
  ];
}
