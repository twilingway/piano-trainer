import { BufferGeometry, DataTexture, Float32BufferAttribute, MeshStandardMaterial } from "three";
import type { WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { keyboard88Geometry, paintedKeyboardTop } from "./keyboard88Geometry";
import { ThreeKeyEmission } from "./ThreeKeyEmission";
import type { KeyBox } from "./keyBoxes";

function source() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 0, -1, 0, -1, 0, 1, -1, 0, 1, -1, -1], 3)
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 2)
  );
  geometry.setAttribute("uv1", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  return geometry;
}

const box: KeyBox = {
  pitch: 60,
  black: false,
  x: 0,
  width: 23.5,
  bottom: 0,
  top: 22,
  front: 0,
  back: 150,
  uv: { u0: 0.2, u1: 0.3, v0: 0, v1: 0.8 }
};

describe("keyboard88 painted material contract", () => {
  it("preserves shape, baked UV0 and top/body group indices while mapping local UV1 to paint", () => {
    const original = source();
    const geometry = keyboard88Geometry(original, box);
    expect(geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 }
    ]);
    expect(geometry.getAttribute("uv").array).toEqual(original.getAttribute("uv").array);
    expect(geometry.getAttribute("position").array).toEqual(
      original.getAttribute("position").array
    );
    const paint = geometry.getAttribute("keyPaintUv");
    expect(paint.getX(0)).toBeCloseTo(0.207);
    expect(paint.getX(1)).toBeCloseTo(0.293);
    expect(paint.getY(0)).toBeCloseTo(0.8);
    expect(paint.getY(2)).toBe(0);
    expect(original.hasAttribute("keyPaintUv")).toBe(false);
    geometry.dispose();
    original.dispose();
  });

  it("composes the baked paint shader with whole-key emission when materials are cloned", () => {
    const baked = new DataTexture();
    const picture = new DataTexture();
    const source = new MeshStandardMaterial({ map: baked });
    const top = paintedKeyboardTop(source, picture, false, true);
    const emission = new ThreeKeyEmission();
    const [painted, body] = emission.create(60, top, source);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>"
    } as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
    painted.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.uniforms.keyPicture?.value).toBe(picture);
    expect(shader.vertexShader).toContain("vKeyPaintUv = keyPaintUv");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb + keyPaint - keyBase");
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance *=");
    expect(painted.customProgramCacheKey()).toContain("keyboard88-painted-white");
    expect(painted.map).toBe(baked);
    expect(body.map).toBe(baked);
    emission.dispose();
    top.dispose();
    source.dispose();
    picture.dispose();
    baked.dispose();
  });
});
