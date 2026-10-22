import { expect, it } from "vitest";
import { Bone, BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { performanceFaceTarget } from "./performanceFaceTarget";
it("targets posed eyes despite a tall hat and a transformed parent", () => {
  const root = new Group();
  root.scale.setScalar(2);
  root.position.set(40, 10, 20);
  const geometry = new BoxGeometry(10, 10, 10),
    material = new MeshBasicMaterial();
  for (const side of [-1, 1]) {
    const eye = new Mesh(geometry, material);
    eye.name = "Eye_" + String(side);
    eye.position.set(side * 30, 900, -100);
    root.add(eye);
  }
  expect(
    performanceFaceTarget(root, {
      min: { x: -500, y: -700, z: -300 },
      max: { x: 500, y: 2000, z: 700 }
    })
  ).toEqual({ x: 40, y: 1810, z: -180 });
  geometry.dispose();
  material.dispose();
});
it("uses the real head bone before falling back to whole avatar bounds", () => {
  const root = new Group(),
    head = new Bone();
  head.name = "head";
  head.position.set(30, 900, -70);
  root.add(head);
  expect(
    performanceFaceTarget(root, {
      min: { x: -500, y: -700, z: -300 },
      max: { x: 500, y: 2000, z: 700 }
    })
  ).toEqual({ x: 30, y: 900, z: -70 });
});
