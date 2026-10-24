import type { Texture } from "../flatThree";
import { describe, expect, it } from "vitest";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { worldCamera } from "../worldCamera";
import { computerKeyboardSlabGeometry, keyboardSceneBoxes } from "./computerKeyboardSlab";

function slabScene(): KeysScene {
  return {
    faces: [
      {
        key: { pitch: 0, black: false, x: 0, width: 800 },
        source: { y: 0, height: 120 }
      }
    ],
    texture: { width: 800, height: 120 } as Texture,
    camera: worldCamera(800, 600),
    pan: 0,
    offset: { x: 0, y: 0 },
    version: 1
  };
}

describe("3D computer keyboard plate", () => {
  it("keeps one full-width textured plate instead of creating 88 piano keys", () => {
    const boxes = keyboardSceneBoxes(slabScene());
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    if (!box) throw new Error("Missing computer keyboard plate");
    expect(box.pitch).toBe(0);
    expect(box.width).toBe(400);
    expect(box.uv).toEqual({ u0: 0, u1: 1, v0: 0, v1: 1 });
    const geometry = computerKeyboardSlabGeometry(box);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBe(-200);
    expect(geometry.boundingBox?.max.x).toBe(200);
    expect(geometry.boundingBox?.max.y).toBe(0);
    expect(geometry.boundingBox?.min.z).toBe(-142);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < position.count; index++) {
      expect(uv.getX(index)).toBeCloseTo((position.getX(index) + 200) / 400);
      expect(uv.getY(index)).toBeCloseTo((position.getZ(index) + 142) / 142);
    }
    expect(geometry.groups.filter((group) => group.materialIndex === 0)).toHaveLength(1);
    geometry.dispose();
  });

  it("keeps all 88 physical keys for a piano range", () => {
    const scene = slabScene();
    const face = scene.faces[0];
    if (!face) throw new Error("Missing fixture face");
    const boxes = keyboardSceneBoxes({
      ...scene,
      faces: [{ ...face, key: { ...face.key, pitch: 60 } }]
    });
    expect(boxes).toHaveLength(88);
    expect(boxes[0]?.pitch).toBe(21);
    expect(boxes[87]?.pitch).toBe(108);
  });
});
