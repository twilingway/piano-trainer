// @vitest-environment happy-dom
import { Container, Texture } from "./flatThree";
import { describe, expect, it, vi } from "vitest";
import { PerspectiveKeyboardLayer } from "./PerspectiveKeyboardLayer";
import { layoutKeyboard } from "./keyboardLayout";
import { mixedKeyboardCamera } from "./mixedKeyboardCamera";
import { DEFAULT_CAMERA, worldCamera, PANEL_EDGE } from "./worldCamera";

function fixture() {
  const keys = layoutKeyboard(132, 60, 64);
  const faces = [...keys.values()]
    .sort((a, b) => Number(a.black) - Number(b.black))
    .map((key) => ({
      key,
      source: { y: key.black ? 0 : 60, height: key.black ? 60 : 40 },
      top: { setCorners: vi.fn() },
      front: { setCorners: vi.fn() },
      side: { setCorners: vi.fn() },
      polygon: []
    }));
  const layer = Object.assign(Object.create(PerspectiveKeyboardLayer.prototype) as object, {
    container: new Container(),
    faces,
    texture: Texture.WHITE,
    version: 1,
    pan: 0,
    geometry: {
      keyboardTop: 400,
      keyboardHeight: 100,
      blackHeight: 60,
      whiteWidth: 44,
      feltHeight: 5,
      hitY: 395
    }
  }) as unknown as PerspectiveKeyboardLayer;
  const road = worldCamera(800, 600, DEFAULT_CAMERA, PANEL_EDGE, 0.1);
  return { layer, road, faces, keyboard: mixedKeyboardCamera(road, 180) };
}

describe("keyboard projection and picking", () => {
  it("uses the overhead polygons for black-priority inverse picking while exposing both cameras", () => {
    const f = fixture();
    f.layer.draw(f.road, 0, f.keyboard);
    const black = f.faces.find((face) => face.key.pitch === 61);
    if (!black) throw new Error("missing black key");
    const x = f.keyboard.sourceX(black.key.x + black.key.width / 2);
    const projected = f.keyboard.project(x, 36, 100);
    const picked = f.layer.pointAt(projected.x, projected.y);
    expect(picked?.x).toBeCloseTo(black.key.x + black.key.width / 2);
    expect(picked?.y).toBeGreaterThanOrEqual(400);
    expect(picked?.y).toBeLessThan(460);
    expect(f.layer.scene?.roadCamera).toBe(f.road);
    expect(f.layer.scene?.camera).toBe(f.road);
    expect(f.layer.scene?.keyboardCamera).toBe(f.keyboard);
  });
  it("updates pan and camera projection without rebuilding unchanged world meshes", () => {
    const f = fixture();
    f.layer.draw(f.road, 0, f.keyboard);
    const version = f.layer.scene?.version;
    const key = f.faces[0]?.key;
    if (!key) throw new Error("missing key");
    const centre = key.x + key.width / 2;
    f.layer.draw(f.road, 90, mixedKeyboardCamera(f.road, 220));
    expect(f.layer.scene?.version).toBe(version);
    expect(f.layer.scene?.pan).toBe(90);
    const projected = mixedKeyboardCamera(f.road, 220).project(f.road.sourceX(centre - 90), 22, 30);
    expect(f.layer.pointAt(projected.x, projected.y)?.x).toBeCloseTo(centre);
    const changed = worldCamera(800, 600, { ...DEFAULT_CAMERA, scale: 1.4 }, PANEL_EDGE, 0.1);
    f.layer.draw(changed, 90, mixedKeyboardCamera(changed, 220));
    expect(f.layer.scene?.version).toBe((version ?? 0) + 1);
  });
});
