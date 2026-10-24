import type { Camera } from "three";
import type { WorldCamera } from "../worldCamera";
import { projectionMatrix, setCameraProjectionKind, viewMatrix } from "./threeCamera";

/** Existing camera matrices; artistic projection does not alter keyboard perspective. */
export function configureStageCamera(
  camera: Camera,
  world: WorldCamera,
  screen: { readonly width: number; readonly height: number },
  offset?: { readonly x: number; readonly y: number }
): void {
  setCameraProjectionKind(camera, world.params);
  camera.matrix.copy(viewMatrix(world.params)).invert();
  camera.matrixWorldNeedsUpdate = true;
  camera.projectionMatrix.copy(projectionMatrix(world.params, screen.width, screen.height, offset));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
