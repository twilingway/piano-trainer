import type { WorldCamera } from "./worldCamera";

/** Fit only longitudinal model depth about the rear edge; key rise and source meshes stay intact. */
export function keyboardHeightCamera(camera: WorldCamera, height: number): WorldCamera {
  if (!Number.isFinite(height) || height <= 0) return camera;
  const anchor = camera.params.keyboardDepth ?? camera.near.z;
  const rear = camera.project(0, 22, anchor);
  const front = camera.project(0, 22, 0);
  const depth = front.y - rear.y;
  if (rear.scale <= 0 || !Number.isFinite(depth) || depth <= 1e-6) return camera;
  const { prefs, fit, orthographicScale } = camera.params;
  const radians = (prefs.pitch * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const contactDepth =
    (prefs.height * fit - 22 * prefs.scale) * Math.sin(radians) +
    (anchor * prefs.scale + prefs.distance * fit) * cosine;
  let factor: number;
  if (orthographicScale !== undefined || Math.abs(cosine) < 1e-8) factor = height / depth;
  else {
    let low = 0;
    let high = Math.max(0.01, (contactDepth - 10) / (anchor * prefs.scale * cosine));
    for (let step = 0; step < 48; step++) {
      const middle = (low + high) / 2;
      const point = camera.project(0, 22, anchor * (1 - middle));
      if (point.scale > 0 && point.y - rear.y < height) low = middle;
      else high = middle;
    }
    factor = (low + high) / 2;
  }
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return camera;
  const zAt = (z: number) => anchor + (z - anchor) * factor;
  const project: WorldCamera["project"] = (x, y, z) => camera.project(x, y, zAt(z));
  return {
    ...camera,
    params: { ...camera.params, keyboardDepthScale: factor, keyboardDepthAnchor: anchor },
    project,
    projectAtProgress: (x, y, near, far, progress) =>
      camera.projectAtProgress(x, y, zAt(near), zAt(far), progress),
    road: {
      ...camera.road,
      at: (x, progress) =>
        project(
          camera.sourceX(x),
          camera.near.y,
          camera.near.z + (1 - progress) * (camera.roadFarZ - camera.near.z)
        )
    }
  };
}
