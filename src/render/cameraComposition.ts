/** The world view is independent from the saved keyboard camera. */
export type CameraComposition = "standard" | "game" | "free";
export const DEFAULT_WORLD_FOV = 45;
export const WORLD_FOV_LIMITS = { min: 20, max: 100 } as const;
export function normalizeCameraComposition(value: unknown): CameraComposition {
  return value === "game" || value === "free" ? value : "standard";
}
export function normalizeWorldFov(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(WORLD_FOV_LIMITS.min, Math.min(WORLD_FOV_LIMITS.max, value))
    : DEFAULT_WORLD_FOV;
}
export function interactiveWorldCamera(composition: CameraComposition, free: boolean): boolean {
  return composition === "free" || (composition === "standard" && free);
}
