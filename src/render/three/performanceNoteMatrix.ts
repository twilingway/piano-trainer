import type { Matrix4 } from "three";

/** Rotate a lane around its own hit plane so both key colours keep contact. */
export function performanceNoteMatrix(
  matrix: Matrix4,
  x: number,
  y: number,
  z: number,
  laneY: number,
  nearZ: number,
  angle: number,
  longitudinalScale = 1
): void {
  matrix.makeRotationX(angle);
  matrix.elements[8] = matrix.elements[8] * longitudinalScale;
  matrix.elements[9] = matrix.elements[9] * longitudinalScale;
  matrix.elements[10] = matrix.elements[10] * longitudinalScale;
  const dy = y - laneY;
  const dz = (z + nearZ) * longitudinalScale;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  matrix.setPosition(x, laneY + dy * c - dz * s, -nearZ + dy * s + dz * c);
}
