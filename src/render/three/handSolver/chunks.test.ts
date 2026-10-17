import { describe, expect, it } from "vitest";
import type { Finger } from "../../../fingering/fingering";
import library from "../../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { planChunks } from "./chunks";
import type { PlanChunk } from "./chunks";
import type { Library } from "./library";
import { planHand, strikesOf } from "./plan";
import type { FingeredNote } from "./plan";
import { STUDIO_REST } from "./rest";

const LIB = library as unknown as Library;

/** A riff for the left hand and a five-finger line for the right, `bars` times over. */
function song(bars: number): Record<"left" | "right", FingeredNote[]> {
  const left: FingeredNote[] = [];
  const right: FingeredNote[] = [];
  const riff: [Finger, number][] = [
    [3, 40],
    [3, 40],
    [1, 43],
    [3, 40],
    [4, 38],
    [5, 36],
    [5, 35]
  ];
  const line: [Finger, number][] = [
    [1, 60],
    [2, 62],
    [3, 64],
    [4, 65],
    [5, 67],
    [3, 64],
    [1, 60]
  ];
  for (let bar = 0; bar < bars; bar++)
    for (let i = 0; i < 7; i++) {
      const start = bar * 2 + i * 0.28;
      const [lf, lp] = riff[i] ?? [1, 40];
      const [rf, rp] = line[i] ?? [1, 60];
      left.push({ start, duration: 0.25, pitch: lp, finger: lf });
      right.push({ start: start + 0.1, duration: 0.2, pitch: rp, finger: rf });
    }
  return { left, right };
}

describe("planChunks", () => {
  it("hands on both hands in parts that add up to the whole plan", () => {
    const notes = song(2);
    const chunks: PlanChunk[] = [...planChunks(STUDIO_REST, LIB, notes, () => true)];
    for (const hand of ["left", "right"] as const) {
      const parts = chunks.filter((c) => c.hand === hand);
      expect(parts.length).toBeGreaterThan(1);
      expect(parts[parts.length - 1]?.done).toBe(true);
      expect(parts.slice(0, -1).every((p) => !p.done)).toBe(true);
      const whole = planHand(STUDIO_REST, LIB, hand, strikesOf(notes[hand], hand));
      expect(parts.flatMap((p) => p.keys)).toEqual(whole.keys);
      expect(parts.flatMap((p) => p.poses).map((p) => p.rootVec)).toEqual(
        whole.poses.map((p) => p.rootVec)
      );
    }
    // The lagging hand goes first: the parts alternate rather than finishing one hand first.
    expect(new Set(chunks.slice(0, 4).map((c) => c.hand)).size).toBe(2);
  });

  it("finishes a hand without fingered notes at once, empty", () => {
    const notes = { left: [], right: song(1).right };
    const first = planChunks(STUDIO_REST, LIB, notes, () => false).next().value as PlanChunk;
    expect(first).toEqual({ hand: "left", keys: [], poses: [], done: true });
  });

  it("plans a song fast enough to stream it", () => {
    const notes = song(20);
    const started = performance.now();
    let firstMs = 0;
    let strikes = 0;
    for (const chunk of planChunks(STUDIO_REST, LIB, notes, () => true)) {
      if (!firstMs) firstMs = performance.now() - started;
      strikes += chunk.poses.length;
    }
    const total = performance.now() - started;
    process.stdout.write(
      `planChunks: ${String(strikes)} strikes in ${total.toFixed(0)} ms (${(total / strikes).toFixed(1)} ms a strike), first part ${firstMs.toFixed(0)} ms\n`
    );
    expect(strikes).toBe(280);
    expect(firstMs).toBeLessThan(1000);
  });
});
