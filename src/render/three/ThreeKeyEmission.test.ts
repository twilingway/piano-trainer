import { DataTexture, MeshStandardMaterial } from "three";
import type { WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import type { EnergySource } from "../noteEnergy";
import { ThreeKeyEmission } from "./ThreeKeyEmission";

const source = (pitch: number, overrides: Partial<EnergySource> = {}): EnergySource => ({
  id: String(pitch),
  pitch,
  color: 0x0080ff,
  strength: 1,
  progress: 1,
  sounding: true,
  ...overrides
});

describe("whole-key note emission", () => {
  it("colours the top and body of sounding keys while keeping distant notes and other keys dark", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const [top, body] = emission.create(60, template, template);
    const other = emission.create(61, template, template);
    emission.update([source(60, { sounding: false, progress: 0.95 })], 0.1);
    expect(top.emissiveIntensity).toBe(0);
    emission.update([source(60)], 0.1);
    expect(top.emissive.r).toBe(0);
    expect(top.emissive.g).toBeCloseTo(128 / 255);
    expect(top.emissive.b).toBe(1);
    expect(top.color.r).toBeLessThan(0.13);
    expect(top.color.b).toBe(1);
    expect(body.emissive).toEqual(top.emissive);
    expect(top.emissiveIntensity).toBeGreaterThan(1);
    expect(top.emissiveIntensity).toBeLessThanOrEqual(1.05);
    expect(body.emissiveIntensity).toBeGreaterThan(0.8);
    expect(other.every((material) => material.emissiveIntensity === 0)).toBe(true);
    expect(template.emissiveIntensity).toBe(1);
    emission.dispose();
    template.dispose();
  });

  it("blends two sounding parts without accumulating brightness beyond the key's cap", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const [top, body] = emission.create(60, template, template);
    for (let frame = 0; frame < 30; frame++)
      emission.update([source(60, { color: 0xff0000 }), source(60, { color: 0x0000ff })], 0.1);
    expect(top.emissive.r).toBeCloseTo(0.5);
    expect(top.emissive.b).toBeCloseTo(0.5);
    expect(top.emissiveIntensity).toBeLessThanOrEqual(1.05);
    expect(body.emissiveIntensity).toBeLessThanOrEqual(0.9);
    emission.dispose();
    template.dispose();
  });

  it("freezes a held key at pause, releases it, and clears it immediately across resets", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const [top, body] = emission.create(60, template, template);
    emission.update([source(60)], 0.1);
    const intensity = top.emissiveIntensity;
    const color = top.emissive.clone();
    emission.update([source(60, { color: 0xff0000 })], 0);
    expect(top.emissiveIntensity).toBe(intensity);
    expect(top.emissive).toEqual(color);
    emission.update([], 0.1);
    expect(top.emissiveIntensity).toBeLessThan(intensity);
    emission.clear();
    expect(top.emissiveIntensity).toBe(0);
    expect(body.emissiveIntensity).toBe(0);
    expect(top.color).toEqual(template.color);
    expect(body.color).toEqual(template.color);
    emission.update([source(60)], 0);
    expect(top.emissiveIntensity).toBe(0);
    emission.dispose();
    template.dispose();
  });

  it("owns cloned materials while retaining shared textures during rebuild and disposal", () => {
    const emission = new ThreeKeyEmission();
    const map = new DataTexture();
    const template = new MeshStandardMaterial({ map });
    const materials = emission.create(60, template, template);
    const disposeTexture = vi.spyOn(map, "dispose");
    const disposeTemplate = vi.spyOn(template, "dispose");
    const disposed = materials.map((material) => vi.spyOn(material, "dispose"));
    expect(materials[0]).not.toBe(template);
    expect(materials[1]).not.toBe(template);
    expect(materials.every((material) => material.map === map)).toBe(true);
    emission.dispose();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(disposeTemplate).not.toHaveBeenCalled();
    expect(disposeTexture).not.toHaveBeenCalled();
    emission.update([source(60)], 0.1);
    expect(materials.every((material) => material.emissiveIntensity === 0)).toBe(true);
    const fresh = emission.create(60, template, template);
    emission.update([source(60)], 0.1);
    expect(fresh[0].emissiveIntensity).toBeGreaterThan(0);
    emission.dispose();
    template.dispose();
    map.dispose();
  });

  it("rebinds the exact paused colour and envelope onto fresh materials without advancing time", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const original = emission.create(60, template, template);
    emission.update([source(60)], 0.03);
    const intensity = original[0].emissiveIntensity;
    const tint = original[0].emissive.clone();
    const dispose = original.map((material) => vi.spyOn(material, "dispose"));
    emission.beginLayout();
    const fresh = emission.create(60, template, template);
    const unplayed = emission.create(72, template, template);
    emission.endLayout();
    emission.update([source(60, { color: 0xff0000 })], 0);
    expect(fresh[0]).not.toBe(original[0]);
    expect(dispose.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(fresh[0].emissiveIntensity).toBe(intensity);
    expect(fresh[0].emissive).toEqual(tint);
    expect(fresh[1].emissive).toEqual(tint);
    expect(unplayed.every((material) => material.emissiveIntensity === 0)).toBe(true);
    emission.finishFrame();
    expect(dispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    emission.dispose();
    template.dispose();
  });

  it("discards a rebuild snapshot on reset so the same paused note stays dark", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    emission.create(60, template, template);
    emission.update([source(60)], 0.1);
    emission.beginLayout();
    emission.clear();
    const fresh = emission.create(60, template, template);
    emission.endLayout();
    emission.update([source(60)], 0);
    expect(fresh.every((material) => material.emissiveIntensity === 0)).toBe(true);
    expect(fresh[0].color).toEqual(template.color);
    emission.dispose();
    template.dispose();
  });

  it("retains one rendered generation while immediately releasing intermediate layouts", () => {
    const emission = new ThreeKeyEmission();
    const texture = new DataTexture();
    const body = new MeshStandardMaterial({ map: texture });
    const textureDispose = vi.spyOn(texture, "dispose");
    const bodyDispose = vi.spyOn(body, "dispose");
    const layout = () => {
      const top = new MeshStandardMaterial({ map: texture });
      emission.ownTemplate(top);
      const materials = emission.create(60, top, body);
      emission.endLayout();
      return {
        materials,
        disposals: [...materials, top].map((material) => vi.spyOn(material, "dispose"))
      };
    };
    const original = layout();
    emission.finishFrame();
    emission.update([source(60)], 0.03);
    const intensity = original.materials[0].emissiveIntensity;
    emission.beginLayout();
    const intermediate = layout();
    emission.beginLayout();
    const current = layout();
    expect(original.disposals.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(intermediate.disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(current.disposals.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(current.materials[0].emissiveIntensity).toBe(intensity);
    emission.finishFrame();
    emission.finishFrame();
    expect(original.disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(intermediate.disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(current.disposals.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    emission.dispose();
    emission.dispose();
    expect(current.disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(bodyDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    body.dispose();
    texture.dispose();
  });

  it("releases both material generations when disposed before a replacement frame", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const original = emission.create(60, template, template);
    const originalDisposals = original.map((material) => vi.spyOn(material, "dispose"));
    emission.beginLayout();
    const top = template.clone();
    emission.ownTemplate(top);
    const current = emission.create(60, top, template);
    const currentDisposals = [...current, top].map((material) => vi.spyOn(material, "dispose"));
    emission.endLayout();
    emission.dispose();
    emission.finishFrame();
    emission.dispose();
    expect(
      [...originalDisposals, ...currentDisposals].every((spy) => spy.mock.calls.length === 1)
    ).toBe(true);
    template.dispose();
  });

  it("keeps inherited shader hooks and shared program ownership alive through the first replacement render", () => {
    const emission = new ThreeKeyEmission();
    const template = new MeshStandardMaterial();
    const decorate = vi.fn((shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0]) => {
      shader.fragmentShader += "\n// inherited painted top";
    });
    template.onBeforeCompile = decorate;
    template.customProgramCacheKey = () => "painted-top-v1";
    const owners = new Set<MeshStandardMaterial>();
    let compilations = 0;
    const render = (materials: readonly MeshStandardMaterial[]) => {
      for (const material of materials) {
        if (owners.size === 0) compilations++;
        expect(material.customProgramCacheKey()).toBe("three-key-neon-v1:painted-top-v1");
        const shader = { fragmentShader: "#include <emissivemap_fragment>" } as Parameters<
          MeshStandardMaterial["onBeforeCompile"]
        >[0];
        material.onBeforeCompile(shader, {} as WebGLRenderer);
        expect(shader.fragmentShader).toContain("inherited painted top");
        expect(shader.fragmentShader).toContain("float keyRim");
        owners.add(material);
        material.addEventListener("dispose", () => {
          owners.delete(material);
        });
      }
    };
    const original = emission.create(60, template, template);
    render(original);
    emission.finishFrame();
    emission.beginLayout();
    const current = emission.create(60, template, template);
    emission.endLayout();
    expect(owners.size).toBe(2);
    render(current);
    emission.finishFrame();
    expect(compilations).toBe(1);
    expect(owners).toEqual(new Set(current));
    expect(decorate).toHaveBeenCalledTimes(4);
    emission.dispose();
    expect(owners.size).toBe(0);
    template.dispose();
  });
});
