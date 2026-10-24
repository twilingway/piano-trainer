export interface ProjectionPoint {
  x: number;
  y: number;
}

export interface ProjectionKeyAnchor extends ProjectionPoint {
  pitch: number;
  width: number;
}

export interface ProjectionParameters {
  readonly version: 1;
  readonly mode: "legacy" | "stylizedProjection";
  readonly horizonY: number;
  readonly horizonSpread: number;
  readonly horizonRadius: number;
  readonly horizonArcDirection: "up" | "down";
  readonly depthExponent: number;
  readonly landingStraighten: number;
  readonly noteScaleNear: number;
  readonly noteScaleFar: number;
  readonly laneGlow: number;
  readonly noteGlow: number;
  readonly debugMapping: boolean;
  readonly debugEvery12: boolean;
  readonly geometryOnly: boolean;
}

export const DEFAULT_PROJECTION_PARAMETERS: ProjectionParameters = {
  version: 1,
  mode: "legacy",
  horizonY: 0.17,
  horizonSpread: 0.92,
  horizonRadius: 2,
  horizonArcDirection: "up",
  depthExponent: 1.6,
  landingStraighten: 0.16,
  noteScaleNear: 1,
  noteScaleFar: 0.12,
  laneGlow: 1,
  noteGlow: 1,
  debugMapping: false,
  debugEvery12: false,
  geometryOnly: false
};

export function normalizeProjectionParameters(value: unknown): ProjectionParameters {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const numeric = (key: keyof ProjectionParameters, low: number, high: number): number => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(low, Math.min(high, value))
      : (DEFAULT_PROJECTION_PARAMETERS[key] as number);
  };
  return {
    version: 1,
    mode: raw.mode === "stylizedProjection" ? "stylizedProjection" : "legacy",
    horizonY: numeric("horizonY", 0.02, 0.6),
    horizonSpread: numeric("horizonSpread", 0.1, 1.5),
    horizonRadius: numeric("horizonRadius", 0.05, 10000),
    horizonArcDirection: raw.horizonArcDirection === "down" ? "down" : "up",
    depthExponent: numeric("depthExponent", 0.5, 3),
    landingStraighten: numeric("landingStraighten", 0.02, 0.4),
    noteScaleNear: numeric("noteScaleNear", 0.2, 2),
    noteScaleFar: numeric("noteScaleFar", 0.02, 0.8),
    laneGlow: numeric("laneGlow", 0, 2),
    noteGlow: numeric("noteGlow", 0, 2),
    debugMapping: raw.debugMapping === true,
    debugEvery12: raw.debugEvery12 === true,
    geometryOnly: raw.geometryOnly === true
  };
}

export const PROJECTION_PRESETS = [
  {
    id: "flat",
    parameters: {
      ...DEFAULT_PROJECTION_PARAMETERS,
      mode: "stylizedProjection",
      horizonRadius: 10000
    }
  },
  {
    id: "curved",
    parameters: {
      ...DEFAULT_PROJECTION_PARAMETERS,
      mode: "stylizedProjection",
      horizonRadius: 0.75
    }
  },
  {
    id: "sunset",
    parameters: {
      ...DEFAULT_PROJECTION_PARAMETERS,
      mode: "stylizedProjection",
      horizonRadius: 1.4,
      noteGlow: 1.4
    }
  }
] as const satisfies readonly { id: string; parameters: ProjectionParameters }[];

export interface ProjectionLane {
  readonly pitch: number;
  readonly index: number;
  readonly horizon: ProjectionPoint;
  readonly key: ProjectionKeyAnchor;
}

export interface ProjectionDiagnostics {
  readonly laneCrossings: number;
  readonly duplicatePitchAnchors: number;
  readonly offscreenAnchors: number;
  readonly nonMonotonicKeyOrder: number;
  readonly horizonTooCurved: boolean;
}

export interface ProjectionLayout {
  readonly width: number;
  readonly height: number;
  readonly parameters: ProjectionParameters;
  readonly lanes: readonly ProjectionLane[];
  readonly valid: boolean;
  readonly warnings: readonly string[];
  readonly joinY: number;
  readonly straightenY: number;
  readonly effectiveRadius: number;
  readonly diagnostics: ProjectionDiagnostics;
}

export function pitchToProjectionIndex(pitch: number): number {
  return Number.isInteger(pitch) && pitch >= 21 && pitch <= 108 ? pitch - 21 : -1;
}

/** Rationalized sag avoids catastrophic subtraction at very large radii. */
export function horizonYAtX(
  layout: Pick<ProjectionLayout, "width" | "height" | "effectiveRadius" | "parameters">,
  x: number
): number {
  const dx = x - layout.width / 2;
  const radius = layout.effectiveRadius;
  const root = Math.sqrt(Math.max(0, radius * radius - dx * dx));
  const sag = (dx * dx) / (radius + root);
  return (
    layout.parameters.horizonY * layout.height +
    (layout.parameters.horizonArcDirection === "up" ? sag : -sag)
  );
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

/** Common horizontal slices, rather than independent curves, preserve lane order. */
export function projectionLaneX(layout: ProjectionLayout, lane: ProjectionLane, y: number): number {
  const q = clampUnit((y - layout.joinY) / Math.max(1e-6, layout.straightenY - layout.joinY));
  if (q === 0) return lane.horizon.x;
  if (q === 1) return lane.key.x;
  const blend = q * q * (3 - 2 * q);
  return lane.horizon.x + (lane.key.x - lane.horizon.x) * blend;
}

export function sampleProjectionLane(
  layout: ProjectionLayout,
  lane: ProjectionLane,
  progress: number,
  target: ProjectionPoint = { x: 0, y: 0 }
): ProjectionPoint {
  const depth = Math.pow(clampUnit(progress), layout.parameters.depthExponent);
  target.y = lane.horizon.y + (lane.key.y - lane.horizon.y) * depth;
  target.x = projectionLaneX(layout, lane, target.y);
  return target;
}

/** Shared Y cuts keep tessellated ribbons ordered just like the continuous warp. */
export function sampleProjectionLaneAtY(
  layout: ProjectionLayout,
  lane: ProjectionLane,
  y: number,
  target: ProjectionPoint = { x: 0, y: 0 }
): ProjectionPoint {
  target.y = Math.max(lane.horizon.y, Math.min(lane.key.y, y));
  target.x = projectionLaneX(layout, lane, target.y);
  return target;
}

/** A common-Y corridor caps bodies inside their neighbours, including black keys. */
export function projectionLaneWidth(
  layout: ProjectionLayout,
  lane: ProjectionLane,
  progress: number
): number {
  const y =
    lane.horizon.y +
    (lane.key.y - lane.horizon.y) * Math.pow(clampUnit(progress), layout.parameters.depthExponent);
  const x = projectionLaneX(layout, lane, y);
  const left = layout.lanes[lane.index - 1];
  const right = layout.lanes[lane.index + 1];
  const clearance = Math.min(
    left ? x - projectionLaneX(layout, left, y) : Infinity,
    right ? projectionLaneX(layout, right, y) - x : Infinity
  );
  const scale =
    layout.parameters.noteScaleFar +
    (layout.parameters.noteScaleNear - layout.parameters.noteScaleFar) * clampUnit(progress);
  return Math.max(0, Math.min(lane.key.width * scale, clearance * 0.8));
}

/** Counts actual crossings of sampled segments with a monotone-Y pair sweep. */
export function countProjectionCrossings(layout: ProjectionLayout, steps = 64): number {
  if (!layout.lanes.length) return 0;
  const topY = Math.min(...layout.lanes.map((lane) => lane.horizon.y));
  const bottomY = Math.max(...layout.lanes.map((lane) => lane.key.y));
  const cuts = [
    layout.joinY,
    layout.straightenY,
    ...Array.from({ length: steps + 1 }, (_, i) => topY + ((bottomY - topY) * i) / steps)
  ].sort((a, b) => a - b);
  const samples = layout.lanes.map((lane) => [
    lane.horizon,
    ...cuts
      .filter((y) => y > lane.horizon.y && y < lane.key.y)
      .map((y) => sampleProjectionLaneAtY(layout, lane, y)),
    lane.key
  ]);
  let crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i];
      const b = samples[j];
      if (!a || !b) continue;
      let ia = 0,
        ib = 0;
      while (ia < a.length - 1 && ib < b.length - 1) {
        const a0 = a[ia],
          a1 = a[ia + 1],
          b0 = b[ib],
          b1 = b[ib + 1];
        if (!a0 || !a1 || !b0 || !b1) break;
        const low = Math.max(a0.y, b0.y),
          high = Math.min(a1.y, b1.y);
        if (high >= low) {
          const xAt = (p: ProjectionPoint, q: ProjectionPoint, y: number) =>
            p.x + (q.x - p.x) * ((y - p.y) / Math.max(1e-12, q.y - p.y));
          const d0 = xAt(a0, a1, low) - xAt(b0, b1, low);
          const d1 = xAt(a0, a1, high) - xAt(b0, b1, high);
          if (Math.min(d0, d1) <= 1e-7 && Math.max(d0, d1) >= -1e-7) {
            crossings++;
            break;
          }
        }
        if (a1.y <= b1.y) ia++;
        else ib++;
      }
    }
  }
  return crossings;
}

export function buildProjectionLayout(
  width: number,
  height: number,
  anchors: readonly ProjectionKeyAnchor[],
  input: ProjectionParameters,
  checkCrossings = false
): ProjectionLayout {
  const parameters = normalizeProjectionParameters(input);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const baseY = safeHeight * parameters.horizonY;
  const minKeyY = Math.min(...anchors.map((key) => key.y));
  const available = minKeyY - baseY;
  const halfSpan = (safeWidth * parameters.horizonSpread) / 2;
  const sagBudget = Math.max(
    1e-3,
    Math.min(available * 0.35, parameters.horizonArcDirection === "down" ? baseY - 1 : Infinity)
  );
  const radiusForSag = (halfSpan * halfSpan + sagBudget * sagBudget) / (2 * sagBudget);
  const requestedRadius = parameters.horizonRadius * safeWidth;
  const effectiveRadius = Math.max(requestedRadius, halfSpan + 1, radiusForSag);
  const curve = { width: safeWidth, height: safeHeight, parameters, effectiveRadius };
  const lanes = anchors.map((key, index): ProjectionLane => {
    const x =
      safeWidth *
      ((1 - parameters.horizonSpread) / 2 + parameters.horizonSpread * ((index + 0.5) / 88));
    return { pitch: key.pitch, index, key: { ...key }, horizon: { x, y: horizonYAtX(curve, x) } };
  });
  const maxHorizonY = Math.max(baseY, ...lanes.map((lane) => lane.horizon.y));
  const joinY = maxHorizonY + Math.max(0.01, available * 0.01);
  const straightenY = minKeyY - Math.max(0.01, available * parameters.landingStraighten);
  const duplicatePitchAnchors = anchors.length - new Set(anchors.map((key) => key.pitch)).size;
  const outside = (point: ProjectionPoint) =>
    point.x < 0 || point.x > safeWidth || point.y < 0 || point.y > safeHeight;
  const offscreenAnchors =
    anchors.filter(outside).length + lanes.filter((lane) => outside(lane.horizon)).length;
  const nonMonotonicKeyOrder = anchors.filter(
    (key, index) => index > 0 && key.x <= (anchors[index - 1]?.x ?? -Infinity)
  ).length;
  const finite = anchors.every(
    (key) =>
      Number.isFinite(key.x) &&
      Number.isFinite(key.y) &&
      Number.isFinite(key.width) &&
      key.width > 0
  );
  const correctPitches =
    anchors.length === 88 && anchors.every((key, index) => key.pitch === index + 21);
  const horizonTooCurved = effectiveRadius > requestedRadius + 1e-6;
  const warnings: string[] = [];
  if (duplicatePitchAnchors) warnings.push("duplicatePitchAnchors");
  if (offscreenAnchors) warnings.push("offscreenAnchors");
  if (nonMonotonicKeyOrder) warnings.push("nonMonotonicKeyOrder");
  if (horizonTooCurved) warnings.push("horizonTooCurved");
  if (!finite || !correctPitches) warnings.push("invalidKeyAnchors");
  if (!(joinY < straightenY)) warnings.push("insufficientLandingSpace");
  const valid = finite && correctPitches && nonMonotonicKeyOrder === 0 && joinY < straightenY;
  const layout: ProjectionLayout = {
    ...curve,
    lanes,
    valid,
    warnings,
    joinY,
    straightenY,
    diagnostics: {
      duplicatePitchAnchors,
      offscreenAnchors,
      nonMonotonicKeyOrder,
      horizonTooCurved,
      laneCrossings: 0
    }
  };
  const laneCrossings = valid && checkCrossings ? countProjectionCrossings(layout) : 0;
  if (laneCrossings) warnings.push("laneCrossings");
  return {
    ...layout,
    valid: valid && laneCrossings === 0,
    diagnostics: { ...layout.diagnostics, laneCrossings }
  };
}
