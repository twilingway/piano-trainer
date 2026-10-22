import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PropertyBinding
} from "three";
import { describe, expect, it } from "vitest";
import { keyboard88Model } from "./keyboard88";
import { metricKeyX } from "../keyboardMetrics";

function primitive() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([-0.01125, 0, 0, 0.01125, 0, 0, 0.01125, 0, -0.15], 3)
  );
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
  geometry.setAttribute("uv1", new Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

describe("keyboard88 runtime extraction", () => {
  it("uses all88 metric world transforms and resolves Blender names after GLTFLoader sanitation", () => {
    const scene = new Group();
    const top = new MeshStandardMaterial(),
      body = new MeshStandardMaterial();
    top.userData.role = "top";
    body.userData.role = "body";
    for (let pitch = 21; pitch <= 108; pitch++) {
      const key = new Group();
      key.name = `key-${String(pitch)}`;
      key.position.set(0.36 + metricKeyX(pitch) / 1000, 0.74, -0.3);
      key.add(new Mesh(primitive(), top), new Mesh(primitive(), body));
      scene.add(key);
    }
    for (const name of [
      "slip.001",
      "board.001",
      "felt.001",
      "table.001",
      "cheek-left",
      "cheek-right",
      "panel-left",
      "panel-right"
    ]) {
      const part = new Mesh(primitive(), body);
      part.name = PropertyBinding.sanitizeNodeName(name);
      scene.add(part);
    }
    const asset = keyboard88Model(scene);
    expect([...asset.keys.keys()]).toEqual(Array.from({ length: 88 }, (_, i) => i + 21));
    expect(asset.case.children.map((part) => part.name)).toContain("table.001");
    for (const key of asset.keys.values()) {
      expect(key.geometry.groups).toEqual([
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 }
      ]);
      const position = key.geometry.getAttribute("position");
      expect(position.getX(0)).toBeCloseTo(-11.25, 4);
      expect(position.getY(0)).toBeCloseTo(0, 4);
      expect(position.getZ(2)).toBeCloseTo(-150, 4);
      expect(key.geometry.hasAttribute("uv1")).toBe(true);
    }
    asset.dispose();
    asset.dispose();
  });
});
