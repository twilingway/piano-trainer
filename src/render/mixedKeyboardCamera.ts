import type { CameraParams, WorldCamera } from "./worldCamera";

/**
 * An off-axis overhead keyboard, calibrated on the road's shared contact plane. Its X scale
 * follows the road; its independent Y scale preserves the player's keyboard-height setting.
 * Pan and detached offsets remain in the existing shell/group transforms, exactly once.
 */
export function mixedKeyboardCamera(road: WorldCamera, keyboardHeight: number): WorldCamera {
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return road;
  const origin = road.project(0, road.near.y, road.near.z);
  const across = road.project(1, road.near.y, road.near.z);
  const scale = road.params.prefs.scale;
  const scaleX = (across.x - origin.x) / scale;
  const scaleY = keyboardHeight / (142 * scale);
  if (origin.scale <= 0 || !Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY))
    return road;
  const prefs = {
    ...road.params.prefs,
    pitch: 90,
    height: Math.max(1000, road.params.prefs.height)
  };
  const originY =
    origin.y + (142 * scale + prefs.distance * road.params.fit) * scaleY - prefs.targetY;
  const params: CameraParams = {
    ...road.params,
    prefs,
    originX: origin.x,
    originY,
    orthographicScale: scaleX,
    orthographicScaleY: scaleY
  };
  const project: WorldCamera["project"] = (x, _y, z) => ({
    x: origin.x + x * scale * scaleX,
    y: origin.y + (142 - z) * scale * scaleY,
    scale: (scale * scaleX) / 2
  });
  return {
    params,
    project,
    sourceX: road.sourceX,
    near: road.near,
    roadFarZ: road.roadFarZ,
    road: {
      at: (x, progress) =>
        project(
          road.sourceX(x),
          road.near.y,
          road.near.z + (1 - progress) * (road.roadFarZ - road.near.z)
        ),
      progressAt: (depth) => depth,
      depthAt: (progress) => progress
    },
    projectAtProgress: (x, y, nearZ, farZ, progress) =>
      project(x, y, farZ + (nearZ - farZ) * Math.max(0, Math.min(1, progress)))
  };
}
