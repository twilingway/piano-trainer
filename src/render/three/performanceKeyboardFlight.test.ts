import { describe, it, expect } from "vitest";
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3
} from "three";
import { performanceMeshObstacles } from "./performanceMeshObstacles";
import { performanceKeyboardFlight } from "./performanceKeyboardFlight";
import { inside } from "./performanceCameraMath";
function posed() {
  const geometry = new BufferGeometry(),
    positions = [
      -150, -700, 300, 150, -700, 300, 150, 200, 500, -150, 200, 300, 150, 200, 300, 0, 1200, 300,
      -300, 100, 80, 300, 100, 80, 300, 140, 220
    ];
  const count = positions.length / 3;
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const bone = new Bone(),
    material = new MeshBasicMaterial(),
    mesh = new SkinnedMesh(geometry, material);
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  return { mesh, bone, geometry, material };
}
describe("actual posed low-flight corridor", () => {
  it("preserves a real gap under a character instead of its filled whole-avatar AABB", () => {
    const { mesh, geometry, material } = posed();
    mesh.computeBoundingBox();
    const box = mesh.boundingBox;
    expect(inside({ x: 0, y: 37, z: 100 }, { min: box.min, max: box.max }, 0)).toBe(true);
    const cells = performanceMeshObstacles(mesh, 1),
      flight = performanceKeyboardFlight(-650, 650, 22, 0, 1, cells, 12);
    expect(flight?.underHands).toBe(true);
    expect(flight?.start.y).toBe(37);
    expect(flight?.start.x).toBe(-650);
    expect(flight?.end.x).toBe(650);
    geometry.dispose();
    material.dispose();
  });
  it("uses the posed skin, rejecting an under-hand flight after the real arm closes the gap", () => {
    const { mesh, bone, geometry, material } = posed();
    bone.position.y = -60;
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const cells = performanceMeshObstacles(mesh, 1),
      flight = performanceKeyboardFlight(-650, 650, 22, 0, 1, cells, 12);
    expect(flight?.underHands).toBe(false);
    expect(flight?.start.z).toBe(-260);
    expect(mesh.getVertexPosition(6, new Vector3()).y).toBe(40);
    geometry.dispose();
    material.dispose();
  });
  it("returns no fake corridor when every safe approach is blocked", () => {
    const obstacles = [
      { min: { x: -1000, y: -1000, z: -1000 }, max: { x: 1000, y: 1000, z: 1000 } }
    ];
    expect(performanceKeyboardFlight(-650, 650, 22, 0, 1, obstacles, 12)).toBeUndefined();
  });
});
