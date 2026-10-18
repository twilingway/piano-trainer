import { lookAngles, mixAngle, mix, point } from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";
interface Look {
  readonly position: CameraPoint;
  readonly target: CameraPoint;
  readonly bank?: number;
}
/** Planned yaw supplies a continuous roll basis even when passing over a vertical target. */
export function cameraOrientation(
  position: CameraPoint,
  target: CameraPoint,
  a: Look,
  b: Look,
  t: number
): { direction: CameraPoint; up: CameraPoint } {
  const direction = point(target.x - position.x, target.y - position.y, target.z - position.z);
  const magnitude = Math.max(1e-9, Math.hypot(direction.x, direction.y, direction.z));
  const forward = point(direction.x / magnitude, direction.y / magnitude, direction.z / magnitude);
  const from = lookAngles(a.position, a.target),
    to = lookAngles(b.position, b.target),
    yaw = mixAngle(from.yaw, to.yaw, t);
  const basisRight = point(-Math.cos(yaw), 0, Math.sin(yaw));
  const dot = basisRight.x * forward.x + basisRight.y * forward.y + basisRight.z * forward.z;
  basisRight.x -= dot * forward.x;
  basisRight.y -= dot * forward.y;
  basisRight.z -= dot * forward.z;
  const basisRightLength = Math.max(1e-9, Math.hypot(basisRight.x, basisRight.y, basisRight.z));
  basisRight.x /= basisRightLength;
  basisRight.y /= basisRightLength;
  basisRight.z /= basisRightLength;
  const up = point(
    basisRight.y * forward.z - basisRight.z * forward.y,
    basisRight.z * forward.x - basisRight.x * forward.z,
    basisRight.x * forward.y - basisRight.y * forward.x
  );

  return {
    direction: forward,
    up: point(
      up.x * Math.cos(mix(a.bank ?? 0, b.bank ?? 0, t)) +
        basisRight.x * Math.sin(mix(a.bank ?? 0, b.bank ?? 0, t)),
      up.y * Math.cos(mix(a.bank ?? 0, b.bank ?? 0, t)) +
        basisRight.y * Math.sin(mix(a.bank ?? 0, b.bank ?? 0, t)),
      up.z * Math.cos(mix(a.bank ?? 0, b.bank ?? 0, t)) +
        basisRight.z * Math.sin(mix(a.bank ?? 0, b.bank ?? 0, t))
    )
  };
}
