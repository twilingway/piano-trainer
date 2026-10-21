import { MeshPhysicalMaterial } from "three";
import type { Color, MeshStandardMaterial } from "three";
import type { EnergySource } from "../noteEnergy";

interface KeyEmission {
  readonly materials: [MeshStandardMaterial, MeshStandardMaterial];
  readonly baseColors: [Color, Color];
  readonly templates: readonly [MeshStandardMaterial, MeshStandardMaterial];
  red: number;
  green: number;
  blue: number;
  weight: number;
  intensity: number;
}
interface DisplayEmission {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly intensity: number;
}

/**
 * Each whole key inherits the sounding note's colour, including its sides and front. Materials
 * are cloned once at layout; their textures remain owned by the shared templates.
 */
export class ThreeKeyEmission {
  private readonly keys = new Map<number, KeyEmission>();
  private readonly retained = new Map<number, DisplayEmission>();
  private readonly ownedTemplates = new Set<MeshStandardMaterial>();

  /** Painted top templates share baked textures but own their shader hook and material object. */
  ownTemplate(material: MeshStandardMaterial): void {
    this.ownedTemplates.add(material);
  }

  /** Only numeric display state survives a rebuild; previous materials are released at once. */
  beginLayout(): void {
    this.retained.clear();
    for (const [pitch, key] of this.keys) {
      if (key.intensity > 0) {
        const tint = key.materials[0].emissive;
        this.retained.set(pitch, {
          red: tint.r,
          green: tint.g,
          blue: tint.b,
          intensity: key.intensity
        });
      }
    }
    this.releaseMaterials();
  }

  endLayout(): void {
    this.retained.clear();
  }

  create(
    pitch: number,
    top: MeshStandardMaterial,
    body: MeshStandardMaterial
  ): [MeshStandardMaterial, MeshStandardMaterial] {
    const materials: [MeshStandardMaterial, MeshStandardMaterial] = [top.clone(), body.clone()];
    for (const [index, material] of materials.entries()) {
      const template = index === 0 ? top : body;
      const decorate = template.onBeforeCompile.bind(template);
      const program = template.customProgramCacheKey();
      material.emissive.setRGB(0, 0, 0);
      material.emissiveIntensity = 0;
      material.onBeforeCompile = (shader, renderer) => {
        decorate(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float keyRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
           totalEmissiveRadiance *= 0.85 + keyRim * 0.8;`
        );
      };
      material.customProgramCacheKey = () => `three-key-neon-v1:${program}`;
    }
    const key: KeyEmission = {
      materials,
      baseColors: [top.color.clone(), body.color.clone()],
      templates: [top, body],
      red: 0,
      green: 0,
      blue: 0,
      weight: 0,
      intensity: 0
    };
    const previous = this.retained.get(pitch);
    if (previous) {
      key.intensity = previous.intensity;
      for (const material of materials)
        material.emissive.setRGB(previous.red, previous.green, previous.blue);
      this.paint(key);
    }
    this.keys.set(pitch, key);
    return materials;
  }

  /** Update existing clones without advancing, clearing or reallocating the note envelope. */
  refreshAppearance(): void {
    for (const key of this.keys.values()) {
      for (let index = 0; index < key.materials.length; index++) {
        const material = key.materials[index];
        const template = key.templates[index];
        const base = key.baseColors[index];
        if (!material || !template || !base) continue;
        base.copy(template.color);
        material.map = template.map;
        material.roughness = template.roughness;
        material.metalness = template.metalness;
        material.bumpMap = template.bumpMap;
        material.bumpScale = template.bumpScale;
        if (material instanceof MeshPhysicalMaterial && template instanceof MeshPhysicalMaterial) {
          material.clearcoat = template.clearcoat;
          material.clearcoatRoughness = template.clearcoatRoughness;
          material.specularIntensity = template.specularIntensity;
          material.sheen = template.sheen;
          material.sheenRoughness = template.sheenRoughness;
          material.sheenColor.copy(template.sheenColor);
        }
      }
      this.paint(key);
    }
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
      this.paint(key);
    }
  }

  clear(): void {
    this.retained.clear();
    for (const key of this.keys.values()) {
      key.intensity = key.weight = 0;
      for (let index = 0; index < key.materials.length; index++) {
        const material = key.materials[index];
        const base = key.baseColors[index];
        if (material && base) {
          material.emissiveIntensity = 0;
          material.color.copy(base);
        }
      }
    }
  }

  dispose(): void {
    this.retained.clear();
    this.releaseMaterials();
  }

  private paint(key: KeyEmission): void {
    const [top, body] = key.materials;
    top.color.copy(key.baseColors[0]).lerp(top.emissive, key.intensity * 0.9);
    body.color.copy(key.baseColors[1]).lerp(body.emissive, key.intensity * 0.9);
    top.emissiveIntensity = key.intensity * 1.05;
    body.emissiveIntensity = key.intensity * 0.9;
  }

  private releaseMaterials(): void {
    for (const key of this.keys.values()) for (const material of key.materials) material.dispose();
    this.keys.clear();
    for (const material of this.ownedTemplates) material.dispose();
    this.ownedTemplates.clear();
  }
}
