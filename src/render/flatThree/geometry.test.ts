import {
  ColorManagement,
  CustomBlending,
  NormalBlending,
  OneFactor,
  OneMinusSrcColorFactor,
  OneMinusSrcAlphaFactor
} from "three";
import { describe, expect, it, vi } from "vitest";
import { Matrix } from "./math";
import { Container } from "./scene";
import { MeshGeometry, NineSliceSprite, PerspectiveMesh, Sprite, TilingSprite } from "./meshes";
import { BufferImageSource, RenderTexture, Texture } from "./textures";

function picture(width = 100, height = 200): Texture {
  return new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(width * height * 4), width, height })
  });
}
describe("flat Three geometry and ownership", () => {
  it("uses premultiplied screen blending for translucent flat plasma and resets normal mode", () => {
    const sprite = new Sprite(picture());
    sprite.blendMode = "screen";
    sprite.alpha = 0.5;
    sprite.syncMaterial(0.5, 0);
    expect(sprite.material.blending).toBe(CustomBlending);
    expect(sprite.uniforms.screenBlend.value).toBe(true);
    expect(sprite.material.blendSrc).toBe(OneFactor);
    expect(sprite.material.blendDst).toBe(OneMinusSrcColorFactor);
    expect(sprite.material.blendSrcAlpha).toBe(OneFactor);
    expect(sprite.material.blendDstAlpha).toBe(OneMinusSrcAlphaFactor);
    sprite.blendMode = "normal";
    sprite.syncMaterial(0.5, 0);
    expect(sprite.material.blending).toBe(NormalBlending);
    expect(sprite.uniforms.screenBlend.value).toBe(false);
    sprite.destroy({ texture: true, textureSource: true });
  });
  it("preserves display tint when the lazy 3D scene changes global color management", () => {
    const before = ColorManagement.enabled,
      sprite = new Sprite(picture());
    sprite.tint = 0x808080;
    try {
      ColorManagement.enabled = true;
      sprite.syncMaterial(1, 0);
      const a = sprite.uniforms.tint.value.toArray();
      ColorManagement.enabled = false;
      sprite.syncMaterial(1, 0);
      expect(sprite.uniforms.tint.value.toArray()).toEqual(a);
      expect(a[0]).toBeCloseTo(128 / 255);
    } finally {
      ColorManagement.enabled = before;
      sprite.destroy({ texture: true, textureSource: true });
    }
  });
  it("keeps native vec3 bounds finite while exposing mutable two dimensional positions", () => {
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 20, 0, 0, 30]),
      uvs: new Float32Array(6),
      indices: [0, 1, 2]
    });
    geometry.native.computeBoundingSphere();
    expect(geometry.native.boundingSphere?.radius).toBeCloseTo(Math.hypot(10, 15));
    geometry.positions[5] = 50;
    geometry.getBuffer("aPosition").update();
    geometry.native.computeBoundingSphere();
    expect(geometry.native.boundingSphere?.radius).toBeCloseTo(Math.hypot(10, 25));
    geometry.destroy();
  });
  it("preserves nine slice edge dimensions while compressing only the interior", () => {
    const sprite = new NineSliceSprite({
      texture: picture(),
      leftWidth: 10,
      rightWidth: 20,
      topHeight: 12,
      bottomHeight: 24
    });
    sprite.setSize(300, 500);
    sprite.updateGeometry();
    expect(Array.from(sprite.geometry.positions.slice(0, 8))).toEqual([
      0, 0, 10, 0, 280, 0, 300, 0
    ]);
    expect(Array.from(sprite.geometry.uvs.slice(0, 8))).toEqual(expect.arrayContaining([0, 1]));
    sprite.width = 15;
    sprite.updateGeometry();
    expect(sprite.geometry.positions[2]).toBe(5);
    expect(sprite.geometry.positions[4]).toBe(5);
    sprite.destroy({ texture: true, textureSource: true });
  });
  it("sizes nine-slice in local texture pixels after keyboard scaling", () => {
    const sprite = new NineSliceSprite({
      texture: picture(100, 200),
      leftWidth: 10,
      rightWidth: 10,
      topHeight: 10,
      bottomHeight: 10
    });
    sprite.scale.set(0.1, 0.2);
    sprite.setSize(200, 500);
    sprite.updateGeometry();
    expect(sprite.width).toBe(200);
    expect(sprite.width * sprite.scale.x).toBe(20);
    expect(sprite.height).toBe(500);
    expect(sprite.height * sprite.scale.y).toBe(100);
    expect(sprite.getLocalBounds().width).toBe(200);
    sprite.destroy({ texture: true, textureSource: true });
  });
  it("uses homogeneous UV weights that map the two diagonals to the same texture center", () => {
    const mesh = new PerspectiveMesh({ texture: picture() });
    mesh.setCorners(30, 0, 70, 0, 100, 100, 0, 100);
    const weights = mesh.geometry.weights;
    // The intersection of the diagonals lies 2/7 down each screen diagonal.
    const s = 2 / 7,
      t = 2 / 7;
    expect(
      (s * (weights[3] ?? 0)) / ((1 - s) * (weights[0] ?? 0) + s * (weights[3] ?? 0))
    ).toBeCloseTo(0.5);
    expect(
      (t * (weights[2] ?? 0)) / ((1 - t) * (weights[1] ?? 0) + t * (weights[2] ?? 0))
    ).toBeCloseTo(0.5);
    mesh.geometry.destroy();
    mesh.destroy({ texture: true, textureSource: true });
  });
  it("shares atlas sources until their explicit owner disposes them", () => {
    const original = picture(),
      dispose = vi.spyOn(original.nativeTexture, "dispose");
    const view = new Texture({ source: original.source });
    view.destroy();
    expect(dispose).not.toHaveBeenCalled();
    expect(original.destroyed).toBe(false);
    original.destroy(true);
    original.destroy(true);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it("resizes RTT physical pixels separately from its logical frame", () => {
    const texture = RenderTexture.create({ width: 100, height: 50, resolution: 2 });
    texture.source.resize(75, 40, 3);
    expect([
      texture.width,
      texture.height,
      texture.renderTarget.width,
      texture.renderTarget.height
    ]).toEqual([75, 40, 225, 120]);
    texture.destroy(true);
  });
  it("keeps tiling per-sprite without changing a shared source", () => {
    const texture = picture(32, 64),
      sprite = new TilingSprite({ texture, width: 128, height: 256 });
    sprite.tileScale.set(2);
    sprite.tilePosition.set(16, 32);
    sprite.syncMaterial(0.5, 4);
    expect(sprite.uniforms.tileFactor.value.toArray()).toEqual([2, 2]);
    expect(sprite.uniforms.tileOffset.value.toArray()).toEqual([0.25, 0.25]);
    expect(texture.nativeTexture.repeat.toArray()).toEqual([1, 1]);
    sprite.destroy({ texture: true, textureSource: true });
  });
});
describe("flat tree transforms", () => {
  it("round-trips nested mirrored, rotated and skewed key coordinates", () => {
    const root = new Container(),
      child = new Container(),
      leaf = new Sprite(picture(20, 40));
    root.position.set(100, 50);
    root.rotation = 0.3;
    child.scale.set(-2, 3);
    child.skew.set(0.2, 0.1);
    child.position.set(7, 13);
    root.addChild(child);
    child.addChild(leaf);
    leaf.position.set(5, 9);
    const local = { x: 13, y: 19 },
      global = leaf.toGlobal(local),
      roundTrip = leaf.toLocal(global);
    expect(roundTrip.x).toBeCloseTo(local.x);
    expect(roundTrip.y).toBeCloseTo(local.y);
    expect(leaf.getGlobalTransform(new Matrix()).apply(local)).toEqual(global);
    root.destroy({ children: true, texture: true, textureSource: true });
  });
  it("keeps insertion order stable among equal sorted layers and supports -Infinity", () => {
    const root = new Container({ sortableChildren: true }),
      a = new Container(),
      b = new Container(),
      c = new Container();
    a.zIndex = 2;
    b.zIndex = -Infinity;
    c.zIndex = 2;
    root.addChild(a, b, c);
    root.sortChildren();
    expect(root.children).toEqual([b, a, c]);
    root.removeChildAt(1);
    expect(a.parent).toBeNull();
    root.destroy({ children: true });
    a.destroy();
  });
});
