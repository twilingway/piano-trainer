import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

/** Depth belongs to one projection; colour and physical lights are shared by both passes. */
export function drawSceneCameraPasses(
  renderer: Pick<WebGLRenderer, "render" | "clearDepth">,
  scene: Scene,
  road: Object3D,
  keys: Object3D,
  roadCamera: Camera,
  keyboardCamera: Camera,
  separate: boolean
): void {
  if (!separate) {
    renderer.render(scene, roadCamera);
    return;
  }
  const roadVisible = road.visible;
  const keysVisible = keys.visible;
  try {
    keys.visible = false;
    renderer.render(scene, roadCamera);
    road.visible = false;
    keys.visible = keysVisible;
    renderer.clearDepth();
    renderer.render(scene, keyboardCamera);
  } finally {
    road.visible = roadVisible;
    keys.visible = keysVisible;
  }
}
