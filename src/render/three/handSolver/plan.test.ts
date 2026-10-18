import { afterEach, describe, expect, it, vi } from "vitest";
import * as placement from "./place";
import { handJoints, tipOf } from "./mech";
import { sampleTrack, trackPose } from "./track";
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
    expect(plan.keys.map((k) => [k.phase, k.strike])).toEqual(
      g.keys.map((k) => [k.phase, k.strike])
    );
    plan.keys.forEach((k, i) => {
      expect(Math.abs(k.t - (g.keys[i]?.t ?? NaN))).toBeLessThan(TOL);
    });
    expect(plan.report.map((r) => r.flags)).toEqual(g.report.map((r) => r.flags));
    expect(plan.report.map((r) => [r.held, r.released, r.lateS, r.missMm])).toEqual(
      g.report.map((r) => [r.held, r.released, r.lateS, r.missMm])
    );
    plan.poses.forEach((p, i) => {
      const want = g.poses[i] as {
        rootVec: number[];
        hover: Record<string, Record<string, number>>;
      };
      p.rootVec.forEach((v, j) => {
        expect(Math.abs(v - (want.rootVec[j] ?? NaN))).toBeLessThan(TOL);
      });
      expect([...p.hover.keys()].map(String).sort()).toEqual(Object.keys(want.hover).sort());
      for (const [f, d] of p.hover)
        for (const [k, v] of Object.entries(d))
          expect(v).toBeCloseTo(want.hover[String(f)]?.[k] ?? NaN, 6);
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

// A synthetic leap isolates scheduling from pose-search heuristics and private lesson data.
describe("score timing policy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a short source onset on time by accelerating a 278 mm transfer", () => {
    const original = placement.place;
    vi.spyOn(placement, "place").mockImplementation((...args) => {
      const pose = original(...args);
      const moved = args[3][0]?.[1] === 72;
      return {
        ...pose,
        rootVec: [
          pose.rootVec[0],
          pose.rootVec[1],
          pose.rootVec[2],
          moved ? 278 : 0,
          moved ? 56 : 0,
          pose.rootVec[5]
        ]
      };
    });
    const onset = 18.882864583333333;
    const duration = 0.09182291666666842;
    const strikes = strikesOf(
      [
        { start: 18.37796875, duration: 0.0806770833, pitch: 60, finger: 3 },
        { start: onset, duration, pitch: 72, finger: 3 }
      ],
      "right"
    );
    const speed = planHand(STUDIO_REST, LIB, "right", strikes);
    const score = planHand(STUDIO_REST, LIB, "right", strikes, "score");
    expect(speed.keys.find((key) => key.strike === 1 && key.phase === "strike")?.t).toBeGreaterThan(
      onset + duration
    );
    expect(speed.report[1]?.flags).toContain("degraded");
    expect(speed.report[1]?.lateS).toBeGreaterThan(0);
    const strike = score.keys.find((key) => key.strike === 1 && key.phase === "strike");
    const ready = score.keys.find((key) => key.strike === 1 && key.phase === "ready");
    expect(strike?.t).toBe(onset);
    expect(ready?.t).toBeLessThan(onset);
    expect(score.report[1]).toMatchObject({ lateS: 0, missMm: 0 });
    expect(score.report[1]?.flags).toContain("accelerated");
    expect(score.report[1]?.flags).not.toContain("degraded");
    expect(score.poses.map((pose) => pose.rootVec)).toEqual(
      speed.poses.map((pose) => pose.rootVec)
    );
  });

  it("orders short repeated strikes precisely and releases the finger between presses", () => {
    const notes = Array.from({ length: 5 }, (_, index) => ({
      start: 0.000013 + index * 0.031017,
      duration: 0.008,
      pitch: 62,
      finger: 2 as const
    }));
    const plan = planHand(STUDIO_REST, LIB, "right", strikesOf(notes, "right"), "score");
    const track = { keys: plan.keys, poses: plan.poses.map(trackPose), done: true };
    plan.keys.forEach((key, index) => {
      if (index > 0) expect(key.t).toBeGreaterThan(plan.keys[index - 1]?.t ?? Infinity);
    });
    for (const [index, note] of notes.entries()) {
      const ready = plan.keys.find((key) => key.strike === index && key.phase === "ready");
      const strike = plan.keys.find((key) => key.strike === index && key.phase === "strike");
      expect(strike?.t).toBe(note.start);
      if (!ready || !strike) throw new Error("Missing repeated key phases");
      const raised = sampleTrack(track, ready.t, STUDIO_REST);
      const pressed = sampleTrack(track, strike.t, STUDIO_REST);
      if (!raised || !pressed) throw new Error("Missing repeated finger pose");
      const hoverZ = tipOf(handJoints(STUDIO_REST, raised.angles, raised.root), 2)[2];
      const pressZ = tipOf(handJoints(STUDIO_REST, pressed.angles, pressed.root), 2)[2];
      expect(hoverZ).toBeGreaterThan(0);
      expect(pressZ).toBeLessThan(hoverZ - 5);
    }
  });

  it("does not label an ordinary unhurried transfer as accelerated", () => {
    const score = planHand(
      STUDIO_REST,
      LIB,
      "right",
      strikesOf(
        [
          { start: 0, duration: 0.2, pitch: 60, finger: 1 },
          { start: 1, duration: 0.2, pitch: 62, finger: 2 }
        ],
        "right"
      ),
      "score"
    );
    expect(score.report.some((report) => report.flags.includes("accelerated"))).toBe(false);
  });
});
