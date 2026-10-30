import { PerspectiveCamera, OrthographicCamera, Group, Mesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { Texture, TextureSource, type Renderer, type Sprite } from "../flatThree";
import { OctaveKeyLabels } from "../octaveKeyLabels";
import { NativeOctaveProjection } from "./nativeOctaveProjection";
import type { KeyBox } from "./keyBoxes";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
}

function fixture() {
  const bake = vi.fn(() => new Texture({ source: new TextureSource({ width: 40, height: 32 }) }));
  const labels = new OctaveKeyLabels({ generateTexture: bake } as unknown as Renderer);
  labels.setNative(true);
  const keys = new Group();
  keys.position.set(10, -20, 5);
  keys.scale.set(0.9, 1.2, 1);
  const camera = new PerspectiveCamera(45, 390 / 844, 1, 2000);
  camera.position.set(0, 150, 300);
  camera.lookAt(0, 22, -45);
  camera.updateMatrixWorld();
  const box: KeyBox = {
    pitch: 60,
    black: false,
    x: 0,
    width: 22.5,
    bottom: 0,
    top: 22,
    front: 0,
    back: 150,
    uv: { u0: 0.1, u1: 0.2, v0: 0, v1: 1 }
  };
  const hinge = new Group(),
    mesh = new Mesh();
  mesh.position.y = 22;
  hinge.position.y = -4;
  const hinged = [{ pitch: 60, hinge, mesh }];
  const projection = new NativeOctaveProjection();
  const screen = { width: 390, height: 844 };
  const update = (boxes = [box]) => {
    projection.update(labels, keys, boxes, hinged, camera, screen);
  };
  return { labels, bake, keys, camera, box, hinge, mesh, hinged, projection, screen, update };
}
describe("native octave screen projection", () => {
  it("uses current key matrix, actual top, dip, camera and viewport with readable fixed height", () => {
    const f = fixture();
    f.update();
    const sprite = required(f.labels.nativeSprites.get(60));
    const expected = new Vector3(0, 18, -45).applyMatrix4(f.keys.matrixWorld).project(f.camera);
    expect(sprite.visible).toBe(true);
    expect(sprite.x).toBeCloseTo(((expected.x + 1) * 390) / 2);
    expect(sprite.y).toBeCloseTo(((1 - expected.y) * 844) / 2);
    expect(sprite.height).toBe(18);
    const firstY = sprite.y;
    f.hinge.position.y = -8;
    f.update();
    expect(sprite.y).not.toBe(firstY);
    const beforeX = sprite.x;
    f.screen.width = 780;
    f.update();
    expect(sprite.x).toBeCloseTo(beforeX * 2);
    expect(sprite.height).toBe(18);
    f.labels.destroy();
  });
  it("skips absent UV, non-C, hidden keys, offscreen and behind-camera anchors", () => {
    const f = fixture();
    const sprite = required(f.labels.nativeSprites.get(60));
    f.update([{ ...f.box, uv: { ...f.box.uv, u1: 0.1 } }]);
    expect(sprite.visible).toBe(false);
    f.update([{ ...f.box, pitch: 61 }]);
    expect(sprite.visible).toBe(false);
    f.keys.visible = false;
    f.update();
    expect(sprite.visible).toBe(false);
    f.keys.visible = true;
    f.update();
    expect(sprite.visible).toBe(true);
    f.keys.position.x = 10000;
    f.update();
    expect(sprite.visible).toBe(false);
    f.keys.position.x = 10;
    f.camera.lookAt(0, 150, 1000);
    f.update();
    expect(sprite.visible).toBe(false);
    f.labels.destroy();
  });
  it("reuses the baked textures across frames, locale and mode visibility", () => {
    const f = fixture();
    for (let frame = 0; frame < 20; frame++) f.update();
    const sprite = required(f.labels.nativeSprites.get(60));
    expect(f.bake).toHaveBeenCalledTimes(16);
    expect(f.labels.nativeContainer.children).toHaveLength(8);
    const texture = sprite.texture;
    f.labels.setLocale("en");
    f.update();
    expect(sprite.texture).not.toBe(texture);
    expect(f.bake).toHaveBeenCalledTimes(16);
    f.labels.show(true, true);
    f.update();
    expect(sprite.visible).toBe(false);
    expect(f.labels.nativeContainer.visible).toBe(false);
    f.labels.show(true, false);
    f.update();
    expect(sprite.visible).toBe(true);
    expect(f.labels.container.visible).toBe(false);
    f.labels.setNative(false);
    expect(f.labels.container.visible).toBe(true);
    expect(f.labels.nativeContainer.visible).toBe(false);
    f.labels.destroy();
  });
  it("does not stack C labels if the viewing angle collapses their screen positions", () => {
    const f = fixture();
    const mesh = new Mesh();
    mesh.position.y = 22;
    f.projection.update(
      f.labels,
      f.keys,
      [f.box, { ...f.box, pitch: 72 }],
      [...f.hinged, { pitch: 72, hinge: new Group(), mesh }],
      f.camera,
      f.screen
    );
    expect([...f.labels.nativeSprites.values()].filter((s: Sprite) => s.visible)).toHaveLength(1);
    f.labels.destroy();
  });
});

it("suppresses an authorized C lesson marker in the overlay and restores it when the badge goes", () => {
  const f = fixture();
  f.update();
  const sprite = required(f.labels.nativeSprites.get(60));
  expect(sprite.visible).toBe(true);
  f.labels.setLessonCues([{ noteId: "c", pitch: 60, hand: "left", recommendedFinger: 5 }]);
  f.update();
  expect(sprite.visible).toBe(false);
  expect(f.labels.on).toBe(true);
  f.labels.setLessonCues([]);
  f.update();
  expect(sprite.visible).toBe(true);
  expect(f.bake).toHaveBeenCalledTimes(16);
  f.labels.destroy();
});

it("keeps an edge C8 glyph wholly inside the canvas while skipping an out-of-view anchor", () => {
  const f = fixture();
  f.keys.position.set(0, 0, 0);
  f.keys.scale.set(1, 1, 1);
  f.hinge.position.y = 0;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 200);
  camera.position.z = 100;
  camera.lookAt(0, 0, 0);
  const box = { ...f.box, pitch: 108, x: 0.99, top: 0.99 };
  const hinged = [{ pitch: 108, hinge: f.hinge, mesh: f.mesh }];
  const sprite = required(f.labels.nativeSprites.get(108));
  f.projection.update(f.labels, f.keys, [box], hinged, camera, f.screen);
  expect(sprite.visible).toBe(true);
  expect(sprite.x + sprite.width / 2).toBe(f.screen.width);
  expect(sprite.y - sprite.height).toBe(0);
  f.projection.update(f.labels, f.keys, [{ ...box, x: 1.01 }], hinged, camera, f.screen);
  expect(sprite.visible).toBe(false);
  f.labels.destroy();
});
