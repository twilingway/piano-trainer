import type { Sprite } from "./flatThree";
import type { nativeNoteCameras } from "./nativeViewCameras";

/** Keep the shell's contact row, projection and horizon fog on the same native camera. */
export function nativeRoadCameraLayout(
  cameras: ReturnType<typeof nativeNoteCameras>,
  width: number,
  fog: Pick<Sprite, "position" | "height">
) {
  const camera = cameras.notes;
  const projection = camera.road;
  const hitY = projection.at(width / 2, 1).y;
  const horizonY = projection.at(width / 2, 0).y;
  fog.position.set(0, horizonY);
  fog.height = Math.max(1, (hitY - horizonY) * 0.5);
  return { camera, blackLane: cameras.blackLane, projection, hitY, horizonY };
}
