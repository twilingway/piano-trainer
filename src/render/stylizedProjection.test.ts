import { describe, expect, it } from "vitest";
import {
  buildProjectionLayout,
  countProjectionCrossings,
  DEFAULT_PROJECTION_PARAMETERS,
  horizonYAtX,
  normalizeProjectionParameters,
  pitchToProjectionIndex,
  projectionLaneWidth,
  PROJECTION_PRESETS,
  sampleProjectionLane,
  type ProjectionKeyAnchor,
  type ProjectionParameters
} from "./stylizedProjection";

function item<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing test item ${String(index)}`);
  return value;
}

const black = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);

function anchors(width: number, height: number): ProjectionKeyAnchor[] {
  const step = (width * 0.94) / 52;
  let whites = 0;
  return Array.from({ length: 88 }, (_, index) => {
    const pitch = index + 21;
    const isBlack = black(pitch);
    const x = width * 0.03 + step * (isBlack ? whites - 0.06 : whites + 0.5);
    if (!isBlack) whites++;
    return { pitch, x, y: height * (isBlack ? 0.77 : 0.8), width: step * (isBlack ? 0.55 : 0.94) };
  });
}

function layout(parameters: ProjectionParameters = DEFAULT_PROJECTION_PARAMETERS) {
  return buildProjectionLayout(1920, 1080, anchors(1920, 1080), parameters);
}

describe("88-pitch projection contract", () => {
  it("maps all pitches without aliasing or accepting out-of-range notes", () => {
    expect(pitchToProjectionIndex(21)).toBe(0);
    expect(pitchToProjectionIndex(60)).toBe(39);
    expect(pitchToProjectionIndex(108)).toBe(87);
    expect(pitchToProjectionIndex(20)).toBe(-1);
    expect(pitchToProjectionIndex(108.1)).toBe(-1);
    const result = layout();
    expect(result.valid).toBe(true);
    expect(result.lanes).toHaveLength(88);
    expect(new Set(result.lanes.map((lane) => lane.horizon.x)).size).toBe(88);
    for (const lane of result.lanes) {
      expect(sampleProjectionLane(result, lane, 0)).toEqual(lane.horizon);
      expect(sampleProjectionLane(result, lane, 1).x).toBeCloseTo(lane.key.x, 10);
      expect(sampleProjectionLane(result, lane, 1).y).toBeCloseTo(lane.key.y, 10);
    }
  });

  it("does not silently sort, merge or relocate malformed anchors", () => {
    const keys = anchors(1920, 1080);
    const left = item(keys, 0);
    keys[0] = item(keys, 1);
    keys[1] = left;
    const invalid = buildProjectionLayout(1920, 1080, keys, DEFAULT_PROJECTION_PARAMETERS);
    expect(invalid.valid).toBe(false);
    expect(invalid.warnings).toContain("nonMonotonicKeyOrder");
    expect(item(invalid.lanes, 0).key).toEqual(keys[0]);
    expect(countProjectionCrossings(invalid)).toBeGreaterThan(0);
    keys[1] = item(keys, 0);
    expect(
      buildProjectionLayout(1920, 1080, keys, DEFAULT_PROJECTION_PARAMETERS).warnings
    ).toContain("duplicatePitchAnchors");
  });

  it("reports offscreen anchors but retains ordered physical contacts", () => {
    const keys = anchors(1920, 1080);
    item(keys, 0).x = -50;
    const result = buildProjectionLayout(1920, 1080, keys, DEFAULT_PROJECTION_PARAMETERS);
    expect(result.valid).toBe(true);
    expect(result.diagnostics.offscreenAnchors).toBe(1);
    expect(sampleProjectionLane(result, item(result.lanes, 0), 1).x).toBe(-50);
  });

  it("freezes cached contacts when the reusable scene input changes", () => {
    const keys = anchors(1920, 1080);
    const cached = buildProjectionLayout(1920, 1080, keys, DEFAULT_PROJECTION_PARAMETERS);
    const original = { ...item(keys, 0) };
    const landing = sampleProjectionLane(cached, item(cached.lanes, 0), 1);
    item(keys, 0).x += 12;
    item(keys, 0).y += 8;
    item(keys, 0).width *= 0.5;
    expect(item(cached.lanes, 0).key).toEqual(original);
    expect(sampleProjectionLane(cached, item(cached.lanes, 0), 1)).toEqual(landing);
    const rebuilt = buildProjectionLayout(1920, 1080, keys, DEFAULT_PROJECTION_PARAMETERS);
    expect(item(rebuilt.lanes, 0).key).toEqual(item(keys, 0));
  });

  it("counts clipped horizon sources as well as clipped key contacts", () => {
    const keys = anchors(1920, 1080);
    item(keys, 0).x = -50;
    const result = buildProjectionLayout(1920, 1080, keys, {
      ...DEFAULT_PROJECTION_PARAMETERS,
      horizonSpread: 1.5
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics.offscreenAnchors).toBe(31);
    expect(result.warnings).toContain("offscreenAnchors");
  });
});

it("keeps extreme supported settings ordered or rejects an impossible camera explicitly", () => {
  for (const direction of ["up", "down"] as const) {
    for (const depthExponent of [0.5, 3]) {
      const settings = {
        ...DEFAULT_PROJECTION_PARAMETERS,
        horizonRadius: 0.05,
        horizonSpread: 1.5,
        horizonY: 0.6,
        landingStraighten: 0.4,
        horizonArcDirection: direction,
        depthExponent
      };
      const result = buildProjectionLayout(375, 667, anchors(375, 667), settings, true);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.laneCrossings).toBe(0);
    }
  }
  const impossible = anchors(375, 667).map((key) => ({ ...key, y: 20 }));
  const rejected = buildProjectionLayout(375, 667, impossible, DEFAULT_PROJECTION_PARAMETERS);
  expect(rejected.valid).toBe(false);
  expect(rejected.warnings).toContain("insufficientLandingSpace");
});

describe("screen-space circular horizon", () => {
  it("uses a symmetric circle through its fixed center", () => {
    const result = layout();
    expect(horizonYAtX(result, 960)).toBe(1080 * 0.17);
    expect(horizonYAtX(result, 700)).toBeCloseTo(horizonYAtX(result, 1220), 12);
    expect(horizonYAtX(result, 0)).toBeGreaterThan(horizonYAtX(result, 960));
    const inverted = layout({ ...DEFAULT_PROJECTION_PARAMETERS, horizonArcDirection: "down" });
    expect(horizonYAtX(inverted, 0)).toBeLessThan(horizonYAtX(inverted, 960));
  });

  it("changes sources without moving contacts, and large radius tends to a line", () => {
    const flat = layout(PROJECTION_PRESETS[0].parameters);
    const curved = layout(PROJECTION_PRESETS[1].parameters);
    const range = (value: typeof flat) =>
      Math.max(...value.lanes.map((lane) => lane.horizon.y)) -
      Math.min(...value.lanes.map((lane) => lane.horizon.y));
    expect(range(flat)).toBeLessThan(0.1);
    expect(range(curved)).toBeGreaterThan(100);
    flat.lanes.forEach((lane, i) => {
      expect(lane.key).toEqual(item(curved.lanes, i).key);
    });
  });

  it("caps excessive sag with a finite effective radius and a visible warning", () => {
    for (const direction of ["up", "down"] as const) {
      const result = layout({
        ...DEFAULT_PROJECTION_PARAMETERS,
        horizonRadius: 0.05,
        horizonSpread: 1.5,
        horizonArcDirection: direction
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("horizonTooCurved");
      expect(result.effectiveRadius).toBeGreaterThan((1920 * 1.5) / 2);
      for (const lane of result.lanes) {
        expect(Number.isFinite(lane.horizon.y)).toBe(true);
        expect(lane.horizon.y).toBeGreaterThan(0);
        expect(lane.horizon.y).toBeLessThan(result.straightenY);
      }
    }
  });
});

describe.each([
  [1920, 1080],
  [1366, 768],
  [375, 667],
  [390, 844]
])("all-pair polylines at %dx%d", (width, height) => {
  it.each(PROJECTION_PRESETS)(
    "$id: 88 distinct routes, no actual segment intersections",
    ({ parameters }) => {
      const result = buildProjectionLayout(width, height, anchors(width, height), parameters);
      expect(result.valid).toBe(true);
      expect(result.lanes.length).toBe(88);
      expect(result.diagnostics.laneCrossings).toBe(0);
      // A denser independent sampling catches crossings between different progress values.
      expect(countProjectionCrossings(result, 127)).toBe(0);
      for (const lane of result.lanes) {
        let previousY = lane.horizon.y;
        for (let index = 1; index <= 128; index++) {
          const u = index / 128;
          const point = sampleProjectionLane(result, lane, u);
          expect(point.y).toBeGreaterThan(previousY);
          previousY = point.y;
          expect(projectionLaneWidth(result, lane, u)).toBeGreaterThan(0);
          if (point.y >= result.straightenY) expect(point.x).toBe(lane.key.x);
        }
      }
    }
  );
});

it("has continuous slopes at both common-Y blending boundaries", () => {
  const result = layout(PROJECTION_PRESETS[1].parameters);
  const lane = item(result.lanes, 0);
  const atY = (y: number) => {
    const u = Math.pow(
      (y - lane.horizon.y) / (lane.key.y - lane.horizon.y),
      1 / result.parameters.depthExponent
    );
    return sampleProjectionLane(result, lane, u).x;
  };
  const epsilon = 0.001;
  for (const y of [result.joinY, result.straightenY]) {
    const leftSlope = (atY(y) - atY(y - epsilon)) / epsilon;
    const rightSlope = (atY(y + epsilon) - atY(y)) / epsilon;
    expect(leftSlope).toBeCloseTo(rightSlope, 4);
    expect(leftSlope).toBeCloseTo(0, 4);
  }
});

it("preserves deterministic head and tail progress without consulting frame time", () => {
  const result = layout();
  const lane = item(result.lanes, 39);
  const start = 8,
    duration = 2,
    approach = 6;
  const progress = (event: number, time: number) => 1 - (event - time) / approach;
  const head = sampleProjectionLane(result, lane, progress(start, start));
  const tailBefore = sampleProjectionLane(result, lane, progress(start + duration, start));
  const tailAfter = sampleProjectionLane(
    result,
    lane,
    progress(start + duration, start + duration)
  );
  expect(head).toEqual({ x: lane.key.x, y: lane.key.y });
  expect(tailBefore.y).toBeLessThan(head.y);
  expect(tailAfter).toEqual(head);
  expect(sampleProjectionLane(result, lane, progress(start, 5))).toEqual(
    sampleProjectionLane(result, lane, progress(start, 5))
  );
});

it("normalizes persisted settings without NaN and retains the legacy default", () => {
  expect(normalizeProjectionParameters(undefined)).toEqual(DEFAULT_PROJECTION_PARAMETERS);
  const restored = normalizeProjectionParameters(
    JSON.parse(JSON.stringify(PROJECTION_PRESETS[2].parameters))
  );
  expect(restored).toEqual(PROJECTION_PRESETS[2].parameters);
  const safe = normalizeProjectionParameters({
    horizonRadius: NaN,
    horizonSpread: Infinity,
    version: 50
  });
  expect(safe.version).toBe(1);
  expect(safe.horizonRadius).toBe(2);
  expect(safe.horizonSpread).toBe(0.92);
});
