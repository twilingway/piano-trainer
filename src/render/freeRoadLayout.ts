export interface FreeRoadLayout {
  readonly height: number;
  readonly distance: number;
  readonly width: number;
  readonly shape: "line" | "convex" | "concave";
}
export const DEFAULT_FREE_DIRECT_FIELD: FreeRoadLayout = {
  height: 2,
  distance: 0,
  width: 4,
  shape: "line"
};
export const DEFAULT_FREE_PERSPECTIVE_FIELD: FreeRoadLayout = {
  height: 2,
  distance: 4,
  width: 6,
  shape: "line"
};

export function normalizeFreeRoadLayout(
  value: unknown,
  fallback = DEFAULT_FREE_DIRECT_FIELD
): FreeRoadLayout {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (key: "height" | "distance" | "width", low: number, high: number): number => {
    const candidate = input[key];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(low, Math.min(high, candidate))
      : fallback[key];
  };
  return {
    height: number("height", 0.25, 8),
    distance: number("distance", 0, 20),
    width: number("width", 0.25, 30),
    shape:
      input.shape === "line" || input.shape === "convex" || input.shape === "concave"
        ? input.shape
        : fallback.shape
  };
}

export interface FreeRoadPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface FreeRoadLane {
  readonly pitch: number;
  readonly near: FreeRoadPoint;
  readonly far: FreeRoadPoint;
  readonly width: number;
}

/** All selected semitones own a fixed source, independently from the current song or visibility. */
export function freeRoadLanes(
  contacts: readonly Omit<FreeRoadLane, "far">[],
  layout: FreeRoadLayout
): FreeRoadLane[] {
  if (contacts.length === 0) return [];
  const low = Math.min(...contacts.map((l) => l.pitch)),
    high = Math.max(...contacts.map((l) => l.pitch));
  const axis =
    (Math.min(...contacts.map((l) => l.near.x)) + Math.max(...contacts.map((l) => l.near.x))) / 2;
  const back = Math.min(...contacts.map((l) => l.near.z));
  const width = layout.width * 1000,
    amplitude = width * (1 - Math.cos(Math.PI / 6));
  const minSag = Math.min(
    ...contacts.map((lane) => {
      const u = high === low ? 0.5 : (lane.pitch - low) / (high - low);
      return width * (1 - Math.cos(((2 * u - 1) * Math.PI) / 6));
    })
  );
  return contacts
    .map((lane) => {
      const u = high === low ? 0.5 : (lane.pitch - low) / (high - low),
        theta = ((2 * u - 1) * Math.PI) / 6;
      const sag = width * (1 - Math.cos(theta));
      return {
        ...lane,
        far: {
          x: axis + (layout.shape === "line" ? (u - 0.5) * width : width * Math.sin(theta)),
          y:
            22 +
            layout.height * 1000 +
            (high === low
              ? 0
              : layout.shape === "convex"
                ? amplitude - sag
                : layout.shape === "concave"
                  ? sag - minSag
                  : 0),
          z: back - layout.distance * 1000
        }
      };
    })
    .sort((a, b) => a.pitch - b.pitch);
}

/** The slab normal stays perpendicular to the route and transverse world X, including vertical boards. */
export function freeRoadPoint(
  lane: FreeRoadLane,
  progress: number,
  across = 0,
  lift = 0
): FreeRoadPoint {
  const dy = lane.far.y - lane.near.y,
    dz = lane.far.z - lane.near.z,
    length = Math.max(0.000001, Math.hypot(dy, dz));
  return {
    x: lane.near.x + (lane.far.x - lane.near.x) * progress + across,
    y: lane.near.y + dy * progress - (dz / length) * lift,
    z: lane.near.z + dz * progress + (dy / length) * lift
  };
}
