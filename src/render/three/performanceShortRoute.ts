import { point } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";
import type {
  PerformanceCameraGeometry,
  PerformanceCameraNode as Node
} from "./performanceCameraTypes";
import { performanceSignPlacement } from "./performanceStageLayout";

/** Seconds from the top view at the end of the opening to the start of the pass. */
const ARRIVE_SECONDS = 3;
/** The song's last seconds: the camera turns into the sign and flies through it. */
const THROUGH_SECONDS = 4;
/** When the camera starts its straight run at the sign, before the end of the song. */
const APPROACH_SECONDS = 1.2;
const FOV = 40;
/** The share of the frame width the sign fills, seen square on. */
const SIGN_FILL = 0.8;
/** How far the pass reaches to either side of the sign's middle, in viewing distances. */
const SWING = 0.5;

/**
 * A song under a minute: one slow pass from left to right in front of the pianist with the neon
 * sign held large in the middle of the frame, then a run straight at the sign and through it. The
 * note road keeps its flat opening angle and the camera never flies into it.
 */
export function performanceShortRoute(
  g: PerformanceCameraGeometry,
  start: number,
  end: number
): Node[] {
  const sign = performanceSignPlacement(g.bounds, g.unit);
  const tanV = Math.tan((FOV * Math.PI) / 360),
    tanH = tanV * (g.aspect ?? 1.5);
  // A little above the sign's lower edge: the sign fills the top, the pianist's head the bottom.
  const focus = point(sign.base.x, sign.base.y + sign.maxHeight * 0.25, sign.base.z);
  const back = Math.max(
    sign.width / 2 / (SIGN_FILL * tanH),
    (sign.maxHeight * 0.75) / (0.8 * tanV)
  );
  const z = focus.z - back,
    swing = back * SWING;
  const passStart = start + ARRIVE_SECONDS,
    passEnd = end - THROUGH_SECONDS,
    approach = end - APPROACH_SECONDS;
  const pass = point((2 * swing) / (passEnd - passStart), 0, 0);
  const near = point(focus.x, focus.y, focus.z - back * 0.3),
    behind = point(focus.x, focus.y, focus.z + back * 0.25);
  // Straight through the plane at one speed: still moving when the song ends.
  const through = point(0, 0, (behind.z - near.z) / APPROACH_SECONDS);
  // Looking past the sign keeps the view steady while the camera crosses it.
  const beyond = point(focus.x, focus.y, focus.z + back);
  const node = (
    time: number,
    position: CameraPoint,
    target: CameraPoint,
    shot: string,
    velocity: CameraPoint
  ): Node => ({ time, position, target, fov: FOV, shot, noteAngle: 0, velocity });
  return [
    node(passStart, point(focus.x - swing, focus.y, z), focus, "sign-pass", pass),
    node(passEnd, point(focus.x + swing, focus.y, z), focus, "sign-pass", pass),
    node(approach, near, beyond, "sign-through", through),
    node(end, behind, beyond, "sign-through", through)
  ];
}
