import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  LinearSRGBColorSpace,
  MeshStandardMaterial
} from "three";
import type { WebGLRenderer } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnergySource } from "../noteEnergy";
import type { Keyboard88 } from "./keyboard88";
import type { KeyBox } from "./keyBoxes";
import { buildKeyboardMesh } from "./buildKeyboardMesh";
import { StageKeyMaterials } from "./StageKeyMaterials";
import { ThreeKeyEmission } from "./ThreeKeyEmission";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 0, -1, 0, -1, 0, 1, -1, 0, 1, -1, -1], 3)
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 2)
  );
  geometry.setAttribute("uv1", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  const picture = new DataTexture();
  const maps = [248, 26].map((value) => {
    const map = new DataTexture(new Uint8Array([value, value, value, 255]), 1, 1);
    map.colorSpace = LinearSRGBColorSpace;
    return map;
  });
  const normal = new DataTexture(),
    roughness = new DataTexture();
  const templates = maps.map((map, index) => {
    const top = new MeshStandardMaterial({
      map,
      normalMap: normal,
      roughnessMap: roughness,
      roughness: index === 0 ? 0.36 : 0.78,
      metalness: 0
    });
    return [top, top.clone()] as const;
  });
  const keyboard: Keyboard88 = {
    keys: new Map(templates.map((materials, index) => [60 + index, { geometry, materials }])),
    case: new Group(),
    dispose: vi.fn()
  };
  const emission = new ThreeKeyEmission();
  const stage = new StageKeyMaterials((dim) => {
    emission.setDim(dim);
  });
  const meshes: ReturnType<typeof buildKeyboardMesh>[] = [];
  const build = (pitch: number, target = emission) => {
    const box: KeyBox = {
      pitch,
      black: pitch === 61,
      x: 20,
      width: 23.5,
      bottom: 0,
      top: 22,
      front: 0,
      back: 150,
      uv: { u0: 0.2, u1: 0.3, v0: 0, v1: 0.8 }
    };
    const mesh = buildKeyboardMesh(box, keyboard, picture, target, stage);
    meshes.push(mesh);
    return mesh;
  };
  const dispose = () => {
    emission.dispose();
    stage.appearance.dispose();
    stage.dispose();
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const pair of templates) for (const material of pair) material.dispose();
    for (const texture of [...maps, normal, roughness, picture]) texture.dispose();
    geometry.dispose();
  };
  return { build, emission, stage, templates, maps, geometry, normal, roughness, picture, dispose };
}
function materials(mesh: ReturnType<typeof buildKeyboardMesh>): MeshStandardMaterial[] {
  if (!Array.isArray(mesh.material)) throw new Error("Expected top and body materials");
  return mesh.material.map((material) => {
    if (!(material instanceof MeshStandardMaterial)) throw new Error("Expected PBR key material");
    return material;
  });
}
const source = (pitch: number): EnergySource => ({
  id: String(pitch),
  pitch,
  color: 0x0080ff,
  strength: 1,
  progress: 1,
  sounding: true
});

describe("native keyboard mesh finish integration", () => {
  it("profiles both real mesh surfaces without replacing baked maps, UV, shape or painted shader", () => {
    const item = fixture();
    for (const pitch of [60, 61]) {
      const mesh = item.build(pitch),
        pair = materials(mesh);
      const template = item.templates[pitch - 60];
      if (!template) throw new Error("Missing fixture templates");
      expect(pair[1]?.roughness).toBeGreaterThan(pair[0]?.roughness ?? 1);
      for (const material of pair) {
        expect(material.color).not.toEqual(template[0].color);
        expect(material.roughness).not.toBe(template[0].roughness);
        expect(material.roughness).toBeGreaterThan(0);
        expect(material.roughness).toBeLessThanOrEqual(1);
        expect(material.map).toBe(template[0].map);
        expect(material.map?.colorSpace).toBe(LinearSRGBColorSpace);
        expect(material.normalMap).toBe(item.normal);
        expect(material.roughnessMap).toBe(item.roughness);
        expect(material.metalness).toBe(0);
      }
      for (const name of ["position", "normal", "uv", "uv1"])
        expect(mesh.geometry.getAttribute(name).array).toEqual(
          item.geometry.getAttribute(name).array
        );
      expect(mesh.geometry.groups).toEqual(item.geometry.groups);
      expect(item.geometry.hasAttribute("keyPaintUv")).toBe(false);
      expect(mesh.geometry.hasAttribute("keyPaintUv")).toBe(true);
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <begin_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>"
      } as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
      pair[0]?.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.uniforms.keyPicture?.value).toBe(item.picture);
      expect(shader.fragmentShader).toContain("diffuseColor.rgb + keyPaint - keyBase");
      expect(shader.fragmentShader).toContain("totalEmissiveRadiance *=");
      expect(
        template.every((material) => material.color.toArray().every((value) => value === 1))
      ).toBe(true);
      item.stage.appearance.setDim(true);
      for (const [index, material] of pair.entries()) {
        expect(material.color).toEqual(template[index]?.color);
        expect(material.roughness).toBe(template[index]?.roughness);
      }
      item.stage.appearance.setDim(false);
    }
    item.dispose();
  });

  it("keeps exact paused hue and envelope through repeated toggles, then restores the selected finish", () => {
    const item = fixture(),
      control = new ThreeKeyEmission();
    const sounding = [60, 61].map(source);
    const live = [60, 61].map((pitch) => materials(item.build(pitch)));
    const untouched = [60, 61].map((pitch) => materials(item.build(pitch, control)));
    const brightColors = live.map((pair) => pair.map((material) => material.color.clone()));
    item.emission.update(sounding, 0.03);
    control.update(sounding, 0.03);
    const clone = vi.spyOn(MeshStandardMaterial.prototype, "clone");
    const dispose = live.flat().map((material) => vi.spyOn(material, "dispose"));
    for (let repeat = 0; repeat < 10; repeat++) {
      for (const dim of [true, true, false, false]) {
        item.stage.appearance.setDim(dim);
        for (const [index, pair] of live.entries())
          for (const [surface, material] of pair.entries()) {
            expect(material.emissive).toEqual(untouched[index]?.[surface]?.emissive);
            expect(material.emissiveIntensity).toBe(untouched[index]?.[surface]?.emissiveIntensity);
          }
      }
    }
    expect(clone).not.toHaveBeenCalled();
    expect(dispose.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    item.emission.update([], 0.025);
    control.update([], 0.025);
    for (const [index, pair] of live.entries())
      for (const [surface, material] of pair.entries())
        expect(material.emissiveIntensity).toBe(untouched[index]?.[surface]?.emissiveIntensity);
    item.emission.clear();
    for (const [index, pair] of live.entries())
      for (const [surface, material] of pair.entries())
        expect(material.color).toEqual(brightColors[index]?.[surface]);
    item.stage.appearance.setDim(true);
    item.emission.clear();
    expect(
      live.flat().every((material) => material.color.toArray().every((value) => value === 1))
    ).toBe(true);
    control.dispose();
    item.dispose();
  });

  it("rebuilds the selected finish and numeric emission while disposing only old owned materials", () => {
    const item = fixture();
    const owned = vi.spyOn(item.emission, "ownTemplate");
    item.stage.appearance.setDim(true);
    const old = materials(item.build(61));
    item.stage.appearance.setDim(false);
    const bright = old.map((material) => ({
      color: material.color.clone(),
      roughness: material.roughness
    }));
    item.stage.appearance.setDim(true);
    const oldPainted = owned.mock.calls[0]?.[0];
    if (!oldPainted) throw new Error("Missing painted template");
    const oldDispose = [...old, oldPainted].map((material) => vi.spyOn(material, "dispose"));
    const sharedDispose = [
      ...item.templates.flat(),
      ...item.maps,
      item.normal,
      item.roughness,
      item.picture
    ].map((resource) => vi.spyOn(resource, "dispose"));
    item.emission.update([source(61)], 0.02);
    const intensity = old[0]?.emissiveIntensity,
      tint = old[0]?.emissive.clone();
    item.emission.beginLayout();
    item.stage.appearance.setDim(false);
    const fresh = materials(item.build(61));
    item.emission.endLayout();
    expect(oldDispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(fresh[0]?.emissiveIntensity).toBe(intensity);
    expect(fresh[0]?.emissive).toEqual(tint);
    expect(fresh.map((material) => material.roughness)).toEqual(
      bright.map((material) => material.roughness)
    );
    item.emission.clear();
    expect(fresh[0]?.color).toEqual(bright[0]?.color);
    item.stage.appearance.setDim(true);
    expect(fresh[0]?.color.toArray()).toEqual([1, 1, 1]);
    expect(fresh.map((material) => material.roughness)).toEqual([0.78, 0.78]);
    const freshDispose = fresh.map((material) => vi.spyOn(material, "dispose"));
    item.emission.dispose();
    item.emission.dispose();
    expect(freshDispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(sharedDispose.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    item.dispose();
  });

  it("keeps the computer slab on the existing fallback finish path", () => {
    const item = fixture();
    const slab = materials(item.build(0));
    expect(slab[0]?.color).toEqual(item.stage.top.color);
    expect(slab[1]?.color).toEqual(item.stage.white.color);
    item.stage.appearance.setDim(true);
    expect(slab[0]?.color).toEqual(item.stage.top.color);
    expect(slab[1]?.roughness).toBe(item.stage.white.roughness);
    item.dispose();
  });
});
