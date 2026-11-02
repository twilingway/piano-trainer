export const ROAD_HORIZON_MIN = 0;
export const ROAD_HORIZON_MAX = 1.5;
export const DEFAULT_ROAD_HORIZON = 0.1;

/** One compatible screen-horizon range shared by profiles, controls and projection. */
export function normalizeRoadHorizon(value: unknown, fallback = DEFAULT_ROAD_HORIZON): number {
  const safe = Number.isFinite(fallback)
    ? Math.max(ROAD_HORIZON_MIN, Math.min(ROAD_HORIZON_MAX, fallback))
    : DEFAULT_ROAD_HORIZON;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(ROAD_HORIZON_MIN, Math.min(ROAD_HORIZON_MAX, value))
    : safe;
}
