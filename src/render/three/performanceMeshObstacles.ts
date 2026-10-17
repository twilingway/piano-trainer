import { Box3, Vector3 } from "three";
import type { Mesh } from "three";
import type { CameraBounds } from "./performanceCameraMath";
/** Posed triangle cells preserve real gaps under arms; a character-wide AABB cannot. */
export function performanceMeshObstacles(mesh: Mesh, unit: number): CameraBounds[] {
  const attribute = mesh.geometry.getAttribute("position");
  const positions = new Float64Array(attribute.count * 3),
    vertex = new Vector3();
  for (let index = 0; index < attribute.count; index++) {
    mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = vertex.y;
    positions[index * 3 + 2] = vertex.z;
  }
  const cells = new Map<string, Box3>(),
    index = mesh.geometry.index,
    count = index?.count ?? attribute.count,
    cell = 80 * unit;
  const triangle = new Box3();
  for (let offset = 0; offset + 2 < count; offset += 3) {
    triangle.makeEmpty();
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let corner = 0; corner < 3; corner++) {
      const at = (index?.getX(offset + corner) ?? offset + corner) * 3;
      vertex.set(positions[at] ?? 0, positions[at + 1] ?? 0, positions[at + 2] ?? 0);
      triangle.expandByPoint(vertex);
      cx += vertex.x;
      cy += vertex.y;
      cz += vertex.z;
    }
    const key = [
      Math.floor(cx / (3 * cell)),
      Math.floor(cy / (3 * cell)),
      Math.floor(cz / (3 * cell))
    ].join(":");
    const existing = cells.get(key);
    if (existing) existing.union(triangle);
    else cells.set(key, triangle.clone());
  }
  return [...cells.values()].map((box) => ({
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z }
  }));
}
