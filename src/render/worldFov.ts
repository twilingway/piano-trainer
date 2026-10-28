/** The free camera's field of view, independent from the saved keyboard camera. */
export const DEFAULT_WORLD_FOV = 45;
export const WORLD_FOV_LIMITS = { min: 20, max: 100 } as const;
export function normalizeWorldFov(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(WORLD_FOV_LIMITS.min, Math.min(WORLD_FOV_LIMITS.max, value))
    : DEFAULT_WORLD_FOV;
}
