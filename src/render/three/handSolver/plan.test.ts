import { describe, expect, it } from "vitest";
import type { Finger, Hand } from "../../../fingering/fingering";
import library from "../../../../tools/hand-rig/poses/library/seven-nation-army.json";
import golden from "./golden.json";
import type { Library } from "./library";
import { planHand, strikesOf } from "./plan";
import type { Strike } from "./plan";
import { STUDIO_REST } from "./rest";

const LIB = library as unknown as Library;
const TOL = 1e-6;

describe("planHand", () => {
  it.each(golden.plan.map((g) => [g.name, g] as const))("matches Python: %s", (_, g) => {
    const strikes = g.strikes.map((s) => ({
      ...s,
      thumb: null,
      notes: s.notes.map((n) => ({ ...n, finger: n.finger as Finger }))
    })) as Strike[];
    const started = performance.now();
    const plan = planHand(STUDIO_REST, LIB, g.hand as Hand, strikes);
    const ms = (performance.now() - started) / strikes.length;
    process.stdout.write(`plan ${g.name}: ${ms.toFixed(1)} ms a strike\n`);
    expect(plan.keys.map((k) => [k.phase, k.strike])).toEqual(g.keys.map((k) => [k.phase, k.strike]));
    plan.keys.forEach((k, i) => expect(Math.abs(k.t - (g.keys[i]?.t ?? NaN))).toBeLessThan(TOL));
    expect(plan.report.map((r) => r.flags)).toEqual(g.report.map((r) => r.flags));
    expect(plan.report.map((r) => [r.held, r.released, r.lateS, r.missMm])).toEqual(
      g.report.map((r) => [r.held, r.released, r.lateS, r.missMm])
    );
    plan.poses.forEach((p, i) => {
      const want = g.poses[i] as { rootVec: number[]; hover: Record<string, Record<string, number>> };
      p.rootVec.forEach((v, j) => expect(Math.abs(v - (want.rootVec[j] ?? NaN))).toBeLessThan(TOL));
      expect([...p.hover.keys()].map(String).sort()).toEqual(Object.keys(want.hover).sort());
      for (const [f, d] of p.hover)
        for (const [k, v] of Object.entries(d)) expect(v).toBeCloseTo(want.hover[String(f)]?.[k] ?? NaN, 6);
    });
  });
});

describe("strikesOf", () => {
  it("groups a hand's onsets within 30 ms and leaves out notes without a finger", () => {
    const strikes = strikesOf(
      [
        { start: 0, duration: 0.5, pitch: 60, finger: 1 },
        { start: 0.02, duration: 0.5, pitch: 64, finger: 3 },
        { start: 0.5, duration: 0.2, pitch: 67 },
        { start: 0.5, duration: 0.2, pitch: 65, finger: 4 }
      ],
      "right"
    );
    expect(strikes.map((s) => [s.time, s.notes.map((n) => n.pitch)])).toEqual([
      [0, [60, 64]],
      [0.5, [65]]
    ]);
    expect(strikes[0]?.notes[1]?.end).toBeCloseTo(0.52);
  });
});
