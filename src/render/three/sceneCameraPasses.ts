import type { Camera, Object3D, Scene, WebGLRenderer } from "three";
import { drawDockedScenePasses } from "./dockedScenePasses";
import { drawKeyboardCasePasses } from "./keyboardCasePasses";

/** Depth belongs to one projection; colour and physical lights are shared by both passes. */
export function drawSceneCameraPasses(
  renderer: Pick<WebGLRenderer, "render" | "clearDepth">,
  scene: Scene,
  road: Object3D,
  keys: Object3D,
  roadCamera: Camera,
  keyboardCamera: Camera,
  separate: boolean,
  body?: Object3D,
  roadEffects?: () => void,
  docked = false
): void {
  if (docked) {
    drawDockedScenePasses(renderer, scene, road, keys, roadCamera, keyboardCamera, roadEffects);
    return;
  }
  if (body && body.children.length > 0) {
    drawKeyboardCasePasses(
      renderer,
      scene,
      road,
      keys,
      body,
      roadCamera,
      separate ? keyboardCamera : roadCamera,
      roadEffects
    );
    return;
  }
  roadEffects?.();
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
