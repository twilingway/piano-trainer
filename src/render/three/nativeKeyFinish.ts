import type { MeshStandardMaterial } from "three";

export type NativeKeyFinishKind = "white" | "black";
export type NativeKeySurface = "top" | "body";

const BRIGHT = {
  white: { color: [1, 1.016, 1.06], top: 0.44, body: 0.52 },
  black: { color: [0.95, 1.04, 1.15], top: 0.48, body: 0.56 }
} as const;

/** Baked maps already contain the key's colour; tint their owned clone by a modest factor. */
export function applyNativeKeyFinish(
  material: MeshStandardMaterial,
  template: MeshStandardMaterial,
  kind: NativeKeyFinishKind,
  surface: NativeKeySurface,
  dim: boolean
): void {
  material.color.copy(template.color);
  material.roughness = template.roughness;
  if (dim) return;
  const profile = BRIGHT[kind];
  material.color.r *= profile.color[0];
  material.color.g *= profile.color[1];
  material.color.b *= profile.color[2];
  material.roughness = profile[surface];
}
