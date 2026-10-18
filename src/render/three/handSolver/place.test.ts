import { describe, expect, it } from "vitest";
import type { Finger, Hand } from "../../../fingering/fingering";
import library from "../../../../tools/hand-rig/poses/library/seven-nation-army.json";
import golden from "./golden.json";
import type { Library } from "./library";
import { FINGERS, LONG, THUMB_KEYS, at, handJoints } from "./mech";
import type { Angles, Root } from "./mech";
import { place } from "./place";
import { PYTHON_REST } from "./rest";

const LIB = library as unknown as Library;
/** The port repeats the Python operation for operation: float64 noise only. */
const TOL = 1e-6;

interface GoldenPose {
  readonly source: string;
  readonly flags: string[];
  readonly dropped: number[];
  readonly rootVec: number[];
  readonly curl: number;
  readonly press: Record<string, Record<string, number>>;
  readonly missMm: Record<string, number>;
  readonly angles: Record<string, Record<string, number>>;
}

const toAngles = (a: Record<string, Record<string, number>>) =>
  Object.fromEntries(Object.entries(a).map(([f, v]) => [Number(f), v])) as unknown as Angles;

/** Largest gap between two angle sets, degrees. */
function angleGap(a: Angles, b: Record<string, Record<string, number>>): number {
  let gap = 0;
  for (const k of THUMB_KEYS) gap = Math.max(gap, Math.abs(a[1][k] - (b["1"]?.[k] ?? NaN)));
  for (const f of LONG)
    for (const k of ["mcp", "pip", "dip", "abd"] as const)
      gap = Math.max(gap, Math.abs(a[f][k] - (b[String(f)]?.[k] ?? NaN)));
  return gap;
}

describe("handJoints", () => {
  it.each(golden.joints.map((g, i) => [i, g] as const))("matches Python, set %i", (_, g) => {
    const X = handJoints(PYTHON_REST, toAngles(g.angles), g.root as unknown as Root);
    X.forEach((p, i) => {
      const q = at(g.joints, i);
      expect(Math.hypot(p[0] - (q[0] ?? 0), p[1] - (q[1] ?? 0), p[2] - (q[2] ?? 0))).toBeLessThan(
        TOL
      );
    });
  });
});

describe("place", () => {
  it.each(golden.place.map((g) => [g.name, g] as const))("matches Python: %s", (_, g) => {
    const want = g.pose as unknown as GoldenPose;
    const notes = g.notes.map(([f, p]) => [f as Finger, Number(p)] as const);
    const got = place(PYTHON_REST, LIB, g.hand as Hand, notes);
    expect(got.flags).toEqual(want.flags);
    expect(got.dropped).toEqual(want.dropped);
    expect(got.source).toEqual(want.source);
    got.rootVec.forEach((v, i) => {
      expect(Math.abs(v - (want.rootVec[i] ?? NaN))).toBeLessThan(TOL);
    });
    expect(angleGap(got.angles, want.angles)).toBeLessThan(TOL);
    for (const f of FINGERS) {
      const p = got.press.get(f);
      const w = want.press[String(f)];
      expect(p === undefined).toBe(w === undefined);
      if (p && w)
        for (const [k, v] of Object.entries(w))
          expect(Math.abs(((p as Record<string, number>)[k] ?? NaN) - v)).toBeLessThan(TOL);
      const m = got.missMm[f];
      const wm = want.missMm[String(f)];
      expect(m === undefined).toBe(wm === undefined);
      if (m !== undefined && wm !== undefined) expect(Math.abs(m - wm)).toBeLessThan(TOL);
    }
  });
});
