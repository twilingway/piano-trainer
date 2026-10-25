import { invalidateKeyboardCasePasses } from "./keyboardCasePasses";
import { Line, Mesh, Points, Sprite } from "three";
import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

interface Part {
  readonly object: Object3D;
  readonly keyboard: boolean;
  visible: boolean;
}
interface Membership {
  readonly parts: Part[];
  readonly watched: Object3D[];
  readonly changed: () => void;
}
const cached = new WeakMap<Scene, Membership>();

export function invalidateDockedScenePasses(scene: Scene): void {
  invalidateKeyboardCasePasses(scene);
  const membership = cached.get(scene);
  if (membership)
    for (const object of membership.watched) {
      object.removeEventListener("childadded", membership.changed);
      object.removeEventListener("childremoved", membership.changed);
    }
  cached.delete(scene);
}

/** Camera ownership is explicit; transparent world decorations never become keyboard effects. */
export function drawDockedScenePasses(
  renderer: Pick<WebGLRenderer, "render" | "clearDepth">,
  scene: Scene,
  road: Object3D,
  keys: Object3D,
  worldCamera: Camera,
  keyboardCamera: Camera,
  roadEffects?: () => void
): void {
  let membership = cached.get(scene);
  let parts = membership?.parts;
  if (!parts) {
    const collected: Part[] = [];
    const watched: Object3D[] = [];
    const changed = () => {
      invalidateDockedScenePasses(scene);
    };
    scene.traverse((object) => {
      watched.push(object);
      object.addEventListener("childadded", changed);
      object.addEventListener("childremoved", changed);
      if (!(
        object instanceof Mesh ||
        object instanceof Line ||
        object instanceof Points ||
        object instanceof Sprite
      ))
        return;
      let keyboard = false;
      for (let parent: Object3D | null = object; parent; parent = parent.parent) {
        const role: unknown = parent.userData.cameraCompositionRole;
        if (role === "keyboard") {
          keyboard = true;
          break;
        }
        if (role === "world" || parent === road) break;
        if (parent === keys) {
          keyboard = true;
          break;
        }
      }
      collected.push({ object, keyboard, visible: object.visible });
    });
    parts = collected;
    membership = { parts, watched, changed };
    cached.set(scene, membership);
  }
  for (const part of parts) part.visible = part.object.visible;
  try {
    for (const part of parts) part.object.visible = part.visible && !part.keyboard;
    renderer.render(scene, worldCamera);
    roadEffects?.();
    renderer.clearDepth();
    for (const part of parts) part.object.visible = part.visible && part.keyboard;
    renderer.render(scene, keyboardCamera);
  } finally {
    for (const part of parts) part.object.visible = part.visible;
  }
}
