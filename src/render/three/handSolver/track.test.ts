import { describe, expect, it } from "vitest";
import type { Finger, Hand } from "../../../fingering/fingering";
import library from "../../../../tools/hand-rig/poses/library/seven-nation-army.json";
import golden from "./golden.json";
import type { Library } from "./library";
import { KEY_DIP, WHITE_W, handJoints, keyTarget, tipOf } from "./mech";
import type { Vec3 } from "./mech";
import { HOVER, planHand } from "./plan";
import type { Strike } from "./plan";
import { STUDIO_REST } from "./rest";
import { sampleTrack, trackPose } from "./track";
import type { Track } from "./track";

const LIB = library as unknown as Library;

function trackOf(name: string): { track: Track; strikes: Strike[]; hand: Hand } {
  const g = golden.plan.find((p) => p.name === name);
  if (!g) throw new Error(name);
  const strikes = g.strikes.map((s) => ({
    ...s,
    thumb: null,
    notes: s.notes.map((n) => ({ ...n, finger: n.finger as Finger }))
  })) as Strike[];
  const hand = g.hand as Hand;
  const plan = planHand(STUDIO_REST, LIB, hand, strikes);
  return {
    track: { keys: plan.keys, poses: plan.poses.map(trackPose), done: true },
    strikes,
    hand
  };
}

function tipAt(track: Track, t: number, f: Finger): Vec3 {
  const at = sampleTrack(track, t, STUDIO_REST);
  if (!at) throw new Error("empty track");
  return tipOf(handJoints(STUDIO_REST, at.angles, at.root), f);
}

describe("sampleTrack", () => {
  it("hovers the pressing tip before the onset and presses it by the key's travel at it", () => {
    const { track, strikes, hand } = trackOf("right held note");
    for (const [i, s] of strikes.entries()) {
      const ready = track.keys.find((k) => k.phase === "ready" && k.strike === i);
      const strike = track.keys.find((k) => k.phase === "strike" && k.strike === i);
      const pose = track.poses[i];
      if (!pose) throw new Error("no pose");
      // The placed tip touches its key within the miss; the layers move it from there.
      const X = handJoints(STUDIO_REST, pose.angles, pose.rootVec);
      for (const n of s.notes) {
        const touch = tipOf(X, n.finger)[2];
        expect(touch).toBeLessThan(keyTarget(n.pitch, n.finger, hand === "left").z + 6);
        // Down by the key's travel as far as the joints' walls let it (finger 5 stops short).
        const down = touch - tipAt(track, strike?.t ?? NaN, n.finger)[2];
        expect(down).toBeGreaterThan(3);
        expect(down).toBeLessThan(KEY_DIP + 0.5);
        expect(tipAt(track, ready?.t ?? NaN, n.finger)[2]).toBeCloseTo(touch + HOVER, 0);
      }
    }
  });

  it("keeps a held note's tip down while the hand plays the next strikes", () => {
    const { track, strikes, hand } = trackOf("right held note");
    const held = strikes[0]?.notes[0];
    if (!held) throw new Error("no held note");
    const target = keyTarget(held.pitch, held.finger, hand === "left");
    const from = track.keys.find((k) => k.phase === "strike" && k.strike === 0)?.t ?? NaN;
    for (let t = from; t <= held.end; t += 1 / 60) {
      // Down by most of the key's travel from where it touches (the miss allows 6 mm over the top).
      expect(tipAt(track, t, held.finger)[2]).toBeLessThan(target.z + 6 - KEY_DIP / 2);
    }
    // On its key, a white one's half width off its centre line, in every key pose while it sounds.
    // Between them the tip may slide sideways (design: "Удерживаемая нота посреди переезда").
    for (const key of track.keys.filter((k) => k.t >= from && k.t <= held.end)) {
      const tip = tipAt(track, key.t, held.finger);
      expect(Math.abs(tip[0] - target.x)).toBeLessThan(WHITE_W / 2);
    }
  });

  it("lifts a repeated finger between its notes", () => {
    const { track, strikes, hand } = trackOf("right one finger twice");
    const n = strikes[1]?.notes[0];
    if (!n) throw new Error("no note");
    const target = keyTarget(n.pitch, n.finger, hand === "left");
    const t0 = strikes[0]?.time ?? NaN;
    const t1 = strikes[1]?.time ?? NaN;
    let top = -Infinity;
    for (let t = t0; t <= t1; t += 1 / 120) top = Math.max(top, tipAt(track, t, n.finger)[2]);
    expect(top).toBeGreaterThan(target.z + HOVER - 0.5);
  });

  it("moves without a jump, even when the hand is late", () => {
    const { track } = trackOf("right jump past the limit");
    const first = track.keys[0]?.t ?? 0;
    const last = track.keys[track.keys.length - 1]?.t ?? 0;
    let step = 0;
    let before: Vec3[] | undefined;
    for (let t = first - 0.1; t <= last + 0.1; t += 1 / 60) {
      const at = sampleTrack(track, t, STUDIO_REST);
      if (!at) throw new Error("empty track");
      const X = handJoints(STUDIO_REST, at.angles, at.root);
      if (before)
        X.forEach(
          (p, i) =>
            (step = Math.max(step, Math.hypot(...p.map((v, j) => v - (before?.[i]?.[j] ?? 0)))))
        );
      before = X;
    }
    // The wrist's limit is 503 mm/s: ~8 mm a frame, the ease at most doubles it; a jump is the leap.
    expect(step).toBeLessThan(25);
  });
});
