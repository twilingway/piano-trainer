import type { Object3D } from "three";
import type { WorldCamera } from "../worldCamera";

/** The keys group's scale, which every rig inside that group compensates for. */
export function keysGroupScale(keys: {
  readonly camera: WorldCamera;
  readonly keyboardCamera?: WorldCamera;
}): number {
  return (keys.keyboardCamera ?? keys.camera).params.prefs.scale;
}

/** Keys follow the keyboard camera; the world road keeps its own reference scale and pan. */
export function placeStageGroups(
  keys: Object3D,
  road: Object3D,
  keyboard: WorldCamera,
  world: WorldCamera,
  pan: number,
  unpanned: boolean,
  shared: boolean
): void {
  const scale = keyboard.params.prefs.scale;
  keys.scale.setScalar(scale);
  keys.position.x = unpanned ? 0 : -pan * (keyboard.params.sourceUnits ?? 0.5) * scale;
  // One shared camera needs one shared frame.
  const worldScale = shared ? scale : world.params.prefs.scale;
  road.scale.setScalar(worldScale);
  road.position.set(
    unpanned ? 0 : -pan * (world.params.sourceUnits ?? 0.5) * worldScale,
    keys.position.y,
    keys.position.z
  );
}
