import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { bindKeyboard88Visibility, validateKeyboard88Masks } from "./keyboard88Visibility";
import type { Keyboard88Masks } from "./keyboard88Visibility";

const masks: Keyboard88Masks = { body: [0], rightHand: [1], leftHand: [2], nails: [] };

function fixture() {
  const scene = new Group();
  const parts = ["body", "rightHand", "leftHand"].map((role, i) => {
    const geometry = new BufferGeometry();
    geometry.userData = { role, sourceFaceIds: [i] };
    const node = new Mesh(geometry, new MeshStandardMaterial());
    node.name = "A name deliberately unrelated to its body role";
    scene.add(node);
    return node;
  });
  return { scene, parts };
}

describe("keyboard88 source face visibility", () => {
  it("supports every body/hands combination without allocating or duplicating geometry", () => {
    const { scene, parts } = fixture();
    const geometry = parts.map((part) => part.geometry);
    const visibility = bindKeyboard88Visibility(scene, masks);
    visibility.setVisibility({ body: false, hands: true });
    expect(parts.map((part) => part.visible)).toEqual([false, true, true]);
    visibility.setVisibility({ body: true, hands: false });
    expect(parts.map((part) => part.visible)).toEqual([true, false, false]);
    visibility.setVisibility({ body: true, hands: true, left: false });
    expect(parts.map((part) => part.visible)).toEqual([true, true, false]);
    visibility.setVisibility({ body: false, hands: false });
    expect(parts.map((part) => part.visible)).toEqual([false, false, false]);
    expect(parts.map((part) => part.geometry)).toEqual(geometry);
    expect(scene.children).toHaveLength(3);
    visibility.dispose();
    visibility.dispose();
    expect(parts.map((part) => part.visible)).toEqual([true, true, true]);
    visibility.setVisibility({ body: false, hands: false });
    expect(parts.every((part) => part.visible)).toBe(true);
  });

  it("validates empty nails and disjoint source masks", () => {
    expect(() => {
      validateKeyboard88Masks({ ...masks, nails: [8] });
    }).toThrow("nail");
    expect(() => {
      validateKeyboard88Masks({ ...masks, leftHand: [1] });
    }).toThrow("distinct");
    expect(() => {
      validateKeyboard88Masks({ ...masks, rightHand: [] });
    }).toThrow("empty");
    expect(() => {
      validateKeyboard88Masks({ ...masks, body: [NaN] });
    }).toThrow("distinct");
  });

  it("rejects missing IDs, duplicate geometry and name-based role guesses", () => {
    const { scene, parts } = fixture();
    const [body, , left] = parts;
    if (!body || !left) throw new Error("Incomplete fixture");
    delete body.geometry.userData.role;
    body.name = "body";
    expect(() => bindKeyboard88Visibility(scene, masks)).toThrow("explicit");
    body.geometry.userData.role = "body";
    body.geometry.userData.sourceFaceIds = [1];
    expect(() => bindKeyboard88Visibility(scene, masks)).toThrow("mask");
    body.geometry.userData.sourceFaceIds = [0];
    scene.remove(left);
    expect(() => bindKeyboard88Visibility(scene, masks)).toThrow("missing");
  });
});
