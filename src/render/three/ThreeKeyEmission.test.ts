import { DataTexture, MeshStandardMaterial } from "three";
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
    expect(body.emissive).toEqual(top.emissive);
    expect(top.emissiveIntensity).toBeGreaterThan(0.4);
    expect(top.emissiveIntensity).toBeLessThanOrEqual(0.42);
    expect(body.emissiveIntensity).toBeGreaterThan(0.3);
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
    expect(top.emissiveIntensity).toBeLessThanOrEqual(0.42);
    expect(body.emissiveIntensity).toBeLessThanOrEqual(0.34);
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
});
