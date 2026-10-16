import type { MeshStandardMaterial } from "three";
import type { EnergySource } from "../noteEnergy";

interface KeyEmission {
  readonly materials: [MeshStandardMaterial, MeshStandardMaterial];
  red: number;
  green: number;
  blue: number;
  weight: number;
  intensity: number;
}

/**
 * Each whole key inherits the sounding note's colour, including its sides and front. Materials
 * are cloned once at layout; their textures remain owned by the shared templates.
 */
export class ThreeKeyEmission {
  private readonly keys = new Map<number, KeyEmission>();

  create(
    pitch: number,
    top: MeshStandardMaterial,
    body: MeshStandardMaterial
  ): [MeshStandardMaterial, MeshStandardMaterial] {
    const materials: [MeshStandardMaterial, MeshStandardMaterial] = [top.clone(), body.clone()];
    for (const material of materials) {
      material.emissive.setRGB(0, 0, 0);
      material.emissiveIntensity = 0;
    }
    this.keys.set(pitch, { materials, red: 0, green: 0, blue: 0, weight: 0, intensity: 0 });
    return materials;
  }

  update(sources: readonly EnergySource[], deltaSeconds: number): void {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
    if (delta === 0) return;
    for (const key of this.keys.values()) key.red = key.green = key.blue = key.weight = 0;
    for (const source of sources) {
      if (!source.sounding || !Number.isFinite(source.strength) || source.strength <= 0) continue;
      const key = this.keys.get(source.pitch);
      if (!key) continue;
      const strength = Math.min(1, source.strength);
      key.red += ((source.color >> 16) & 255) * strength;
      key.green += ((source.color >> 8) & 255) * strength;
      key.blue += (source.color & 255) * strength;
      key.weight += strength;
    }
    for (const key of this.keys.values()) {
      const target = Math.min(1, key.weight);
      const rate = target > key.intensity ? 45 : 24;
      key.intensity += (target - key.intensity) * (1 - Math.exp(-delta * rate));
      if (key.intensity < 0.001) key.intensity = 0;
      const [top, body] = key.materials;
      if (key.weight > 0) {
        const factor = 1 / (255 * key.weight);
        top.emissive.setRGB(key.red * factor, key.green * factor, key.blue * factor);
        body.emissive.copy(top.emissive);
      }
      top.emissiveIntensity = key.intensity * 0.42;
      body.emissiveIntensity = key.intensity * 0.34;
    }
  }

  clear(): void {
    for (const key of this.keys.values()) {
      key.intensity = key.weight = 0;
      for (const material of key.materials) material.emissiveIntensity = 0;
    }
  }

  dispose(): void {
    for (const key of this.keys.values()) for (const material of key.materials) material.dispose();
    this.keys.clear();
  }
}
