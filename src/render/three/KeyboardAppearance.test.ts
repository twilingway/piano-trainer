import {
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial
} from "three";
import type { MeshBasicMaterial, PlaneGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import type { KeyBox } from "./keyBoxes";
import { IVORY, ivoryMaterial, velvetMaterial } from "./keyMaterials";
import { KEY_CONTACT_LIMIT, KeyboardAppearance } from "./KeyboardAppearance";
import { ThreeKeyEmission } from "./ThreeKeyEmission";

function fixture() {
  const top = new MeshStandardMaterial({ color: IVORY, map: new DataTexture() });
  const white = ivoryMaterial();
  const black = velvetMaterial();
  const originalWhiteMap = white.map;
  if (!originalWhiteMap) throw new Error("expected ivory grain");
  const sun = new DirectionalLight(0xffffff, 0.45);
  sun.position.set(-150, 900, 900);
  const hemisphere = new HemisphereLight(0xffffff, 0x9a9fac, 0.25);
  const emission = new ThreeKeyEmission();
  const refresh = vi.fn(() => {
    emission.refreshAppearance();
  });
  const appearance = new KeyboardAppearance({ top, white, black, sun, hemisphere, refresh });
  const child = appearance.group.children[0];
  if (!(child instanceof InstancedMesh)) throw new Error("expected contact shadow instances");
  return {
    appearance,
    top,
    white,
    black,
    sun,
    hemisphere,
    refresh,
    emission,
    contacts: child as InstancedMesh<PlaneGeometry, MeshBasicMaterial>,
    originalWhiteMap,
    dispose: () => {
      emission.dispose();
      appearance.dispose();
      originalWhiteMap.dispose();
      top.map?.dispose();
      black.bumpMap?.dispose();
      for (const material of [top, white, black]) material.dispose();
    }
  };
}
const box = (pitch = 61, overrides: Partial<KeyBox> = {}): KeyBox => ({
  pitch,
  black: true,
  x: 40,
  width: 13,
  bottom: 22,
  top: 36,
  front: 57,
  back: 142,
  uv: { u0: 0, u1: 0.1, v0: 0, v1: 1 },
  ...overrides
});

describe("keyboard study appearance", () => {
  it("defaults to neutral bright white keys, readable black bevels and neutral light from the left", () => {
    const item = fixture();
    expect(item.sun.intensity).toBeGreaterThan(1);
    expect(item.hemisphere.intensity).toBeGreaterThan(0.25);
    expect(item.sun.position.x).toBeLessThan(0);
    expect(item.sun.position.y).toBeGreaterThan(Math.abs(item.sun.position.x));
    expect(item.sun.color.r).toBe(item.sun.color.g);
    expect(item.sun.color.g).toBe(item.sun.color.b);
    expect(item.white.map).not.toBe(item.originalWhiteMap);
    if (!(item.white.map instanceof DataTexture)) throw new Error("expected neutral grain");
    const pixels = item.white.map.image.data as Uint8Array;
    for (let i = 0; i < pixels.length; i += 4) {
      expect(Math.abs((pixels[i] ?? 0) - (pixels[i + 2] ?? 0))).toBeLessThanOrEqual(3);
      expect(pixels[i]).toBeGreaterThan(220);
    }
    // Compensate the existing warm painted top without a bright opaque replacement or lost labels.
    const painted = [0xf8, 0xf4, 0xe8];
    const tint = item.top.color.toArray();
    const channels = painted.map((value, index) => value * (tint[index] ?? 0));
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(3);
    expect(item.black.roughness).toBeLessThan(0.78);
    expect(item.black.specularIntensity).toBeGreaterThan(0.15);
    expect(item.black.bumpScale).toBe(0.04);
    expect(item.black.color.r).toBeLessThan(0.2);
    expect(item.appearance.group.visible).toBe(true);
    item.dispose();
  });

  it("restores the dim finish exactly and changes existing resources only once per toggle", () => {
    const item = fixture();
    const geometry = item.contacts.geometry;
    const instances = item.contacts.instanceMatrix;
    const material = item.contacts.material;
    item.appearance.setDim(true);
    item.appearance.setDim(true);
    expect(item.sun.intensity).toBe(0.45);
    expect(item.hemisphere.intensity).toBe(0.25);
    expect(item.sun.position.toArray()).toEqual([-150, 900, 900]);
    expect(item.top.color.getHex()).toBe(IVORY);
    expect(item.white.map).toBe(item.originalWhiteMap);
    expect(item.black.color.getHex()).toBe(0x1a1816);
    expect(item.black.bumpScale).toBe(0.4);
    expect(item.appearance.group.visible).toBe(false);
    item.appearance.setDim(false);
    item.appearance.setDim(false);
    expect(item.refresh).toHaveBeenCalledTimes(3);
    expect(item.contacts.geometry).toBe(geometry);
    expect(item.contacts.instanceMatrix).toBe(instances);
    expect(item.contacts.material).toBe(material);
    item.dispose();
  });

  it("refreshes live material clones on pause without losing note hue, hold or release envelope", () => {
    const item = fixture();
    const white = item.emission.create(60, item.top, item.white);
    const black = item.emission.create(61, item.top, item.black);
    const sources = [60, 61].map((pitch) => ({
      id: String(pitch),
      pitch,
      color: 0x0080ff,
      strength: 1,
      progress: 1,
      sounding: true
    }));
    item.emission.update(sources, 0.05);
    const intensity = white[0].emissiveIntensity;
    const tint = white[0].emissive.clone();
    item.appearance.setDim(true);
    expect(white[1].map).toBe(item.originalWhiteMap);
    item.appearance.setDim(false);
    item.emission.update([], 0);
    for (const materials of [white, black]) {
      expect(materials[0].emissiveIntensity).toBe(intensity);
      expect(materials[0].emissive).toEqual(tint);
      expect(materials[1].emissive).toEqual(tint);
    }
    expect(white[1].map).toBe(item.white.map);
    expect(black[1].roughness).toBe(item.black.roughness);
    item.emission.update([], 0.03);
    expect(white[0].emissiveIntensity).toBeLessThan(intensity);
    item.emission.clear();
    expect(white[0].color).toEqual(item.top.color);
    expect(black[1].color).toEqual(item.black.color);
    item.dispose();
  });

  it("keeps one bounded layout buffer and places soft contacts below black keys, shifted right", () => {
    const item = fixture();
    const boxes = Array.from({ length: 88 }, (_, index) => {
      const pitch = 21 + index;
      return box(pitch, { x: index * 20, black: [1, 3, 6, 8, 10].includes(pitch % 12) });
    });
    const buffer = item.contacts.instanceMatrix;
    item.appearance.layout(boxes);
    expect(item.contacts.count).toBe(36);
    const first = boxes.find((key) => key.black);
    if (!first) throw new Error("expected black key");
    const matrix = new Matrix4();
    item.contacts.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBeGreaterThan(first.x);
    expect(matrix.elements[13]).toBeCloseTo(22.06);
    expect(matrix.elements[14]).toBeCloseTo(-(first.front + first.back - 4) / 2);
    expect(matrix.elements[5]).toBeCloseTo(0);
    expect(matrix.elements[6]).toBeLessThan(0);
    expect(item.contacts.material).toMatchObject({ depthTest: true, depthWrite: false });
    item.appearance.layout(Array.from({ length: 100 }, (_, i) => box(i)));
    expect(item.contacts.count).toBe(KEY_CONTACT_LIMIT);
    expect(item.contacts.instanceMatrix).toBe(buffer);
    item.appearance.layout([box(60, { black: false }), box(61, { x: NaN })]);
    expect(item.contacts.count).toBe(0);
    item.dispose();
  });

  it("disposes only owned resources once and restores shared maps before stage disposal", () => {
    const item = fixture();
    const neutral = item.white.map;
    if (!neutral) throw new Error("expected neutral grain");
    const material = item.contacts.material;
    if (Array.isArray(material)) throw new Error("expected shared AO material");
    const shadowMap = material.alphaMap;
    if (!shadowMap) throw new Error("expected shadow texture");
    const neutralDispose = vi.spyOn(neutral, "dispose");
    const shadowDispose = vi.spyOn(shadowMap, "dispose");
    const geometryDispose = vi.spyOn(item.contacts.geometry, "dispose");
    const meshDispose = vi.spyOn(item.contacts, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const originalDispose = vi.spyOn(item.originalWhiteMap, "dispose");
    item.appearance.dispose();
    item.appearance.dispose();
    for (const dispose of [
      neutralDispose,
      shadowDispose,
      geometryDispose,
      meshDispose,
      materialDispose
    ])
      expect(dispose).toHaveBeenCalledOnce();
    expect(originalDispose).not.toHaveBeenCalled();
    expect(item.white.map).toBe(item.originalWhiteMap);
    expect(item.appearance.group.children).toHaveLength(0);
    item.dispose();
  });
});
