export interface FreeRoadLayout {
  /** Degrees up from the floor: 0 lies flat away from the keys, 90 stands, below 0 goes down. */
  readonly tilt: number;
  /** Metres along the field, from the keys' back line to its far edge. */
  readonly length: number;
  readonly width: number;
  /** Missing in older preferences; their radius was the horizon width. */
  readonly radius?: number;
  readonly shape: "line" | "convex" | "concave";
}

export const FREE_ROAD_LIMITS = {
  tilt: { min: -90, max: 90, step: 0.01 },
  length: { min: 0.05, max: 1000, step: 0.01 },
  width: { min: 0.25, max: 1000, step: 0.01 },
  radius: { min: 0.125, max: 10000, step: 0.01 }
} as const;

export const DEFAULT_FREE_DIRECT_FIELD: FreeRoadLayout = {
  tilt: 90,
  length: 2,
  width: 4,
  radius: 4,
  shape: "line"
};
export const DEFAULT_FREE_PERSPECTIVE_FIELD: FreeRoadLayout = {
  tilt: 26.57,
  length: 4.47,
  width: 6,
  radius: 6,
  shape: "line"
};

const round = (value: number): number => Math.round(value * 100) / 100;

/** The far edge's rise and run in metres: up from the white keys, back from their back line. */
export function freeFieldReach(layout: FreeRoadLayout): { rise: number; run: number } {
  const angle = (layout.tilt * Math.PI) / 180;
  // A standing field has no run at all, not a float crumb of one.
  const run = Math.abs(layout.tilt) === 90 ? 0 : Math.cos(angle);
  return { rise: layout.length * Math.sin(angle), run: layout.length * run };
}

export function normalizeFreeRoadLayout(
  value: unknown,
  fallback = DEFAULT_FREE_DIRECT_FIELD
): FreeRoadLayout {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const finite = (key: string): number | undefined => {
    const candidate = input[key];
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
  };
  const number = (key: keyof typeof FREE_ROAD_LIMITS, defaultValue: number): number => {
    const { min, max } = FREE_ROAD_LIMITS[key];
    return Math.max(min, Math.min(max, finite(key) ?? defaultValue));
  };
  // Older fields were a far edge's height (-100…100 m) and distance (0…1000 m): the same edge.
  const legacyHeight = finite("height"),
    legacyDistance = finite("distance");
  let { tilt, length } = fallback;
  if (
    finite("tilt") === undefined &&
    finite("length") === undefined &&
    (legacyHeight ?? legacyDistance) !== undefined
  ) {
    const reach = freeFieldReach(fallback);
    const rise = Math.max(-100, Math.min(100, legacyHeight ?? reach.rise)),
      run = Math.max(0, Math.min(1000, legacyDistance ?? reach.run));
    tilt = round((Math.atan2(rise, run) * 180) / Math.PI);
    length = round(Math.hypot(rise, run));
  }
  const width = number("width", fallback.width);
  // Legacy arcs used R=W and a sixty-degree sweep. Preserve every angular source on migration.
  const radius = input.radius === undefined ? width : number("radius", fallback.radius ?? width);
  return {
    tilt: number("tilt", tilt),
    length: number("length", length),
    width,
    radius: Math.max(width / 2, radius),
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

/** Stable sagitta avoids cancellation for a nearly straight large-radius horizon. */
function sagitta(radius: number, x: number): number {
  return (x * x) / (radius + Math.sqrt(Math.max(0, radius * radius - x * x)));
}

/** All selected semitones own a fixed source, independently from the current song or visibility. */
export function freeRoadLanes(
  contacts: readonly Omit<FreeRoadLane, "far">[],
  value: FreeRoadLayout
): FreeRoadLane[] {
  if (contacts.length === 0) return [];
  const layout = normalizeFreeRoadLayout(value);
  const low = Math.min(...contacts.map((lane) => lane.pitch)),
    high = Math.max(...contacts.map((lane) => lane.pitch));
  const axis =
    (Math.min(...contacts.map((lane) => lane.near.x)) +
      Math.max(...contacts.map((lane) => lane.near.x))) /
    2;
  const back = Math.min(...contacts.map((lane) => lane.near.z));
  const { rise, run } = freeFieldReach(layout);
  const width = layout.width * 1000,
    radius = (layout.radius ?? layout.width) * 1000,
    halfAngle = Math.asin(Math.min(1, width / (2 * radius))),
    amplitude = sagitta(radius, width / 2);
  const sourceX = (pitch: number): number => {
    const u = high === low ? 0.5 : (pitch - low) / (high - low);
    return layout.shape === "line" ? (u - 0.5) * width : radius * Math.sin((2 * u - 1) * halfAngle);
  };
  const minSag = Math.min(...contacts.map((lane) => sagitta(radius, sourceX(lane.pitch))));
  return contacts
    .map((lane) => {
      const x = sourceX(lane.pitch),
        sag = sagitta(radius, x);
      return {
        ...lane,
        far: {
          x: axis + x,
          y:
            22 +
            rise * 1000 +
            (high === low
              ? 0
              : layout.shape === "convex"
                ? amplitude - sag
                : layout.shape === "concave"
                  ? sag - minSag
                  : 0),
          z: back - run * 1000
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
