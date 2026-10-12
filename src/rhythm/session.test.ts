// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateRhythmExercise } from "./generator";
import { summarizeRhythmHistory } from "./progress";
import { RhythmSession } from "./session";
import type { RhythmAttackEvent, RhythmExercise, RhythmSessionConfig } from "./types";

const config: RhythmSessionConfig = {
  runId: "run-1",
  source: "keyboard",
  startedAt: 100,
  startedAtMs: 1000,
  offsets: {
    inputOffsetMs: 0,
    manualInputOffsetMs: 0,
    audioOutputOffsetMs: 0,
    visualOffsetMs: 0,
    status: "uncalibrated"
  }
};
const event = (songTimeS: number, options: Partial<RhythmAttackEvent> = {}): RhythmAttackEvent => ({
  runId: "run-1",
  source: "keyboard",
  rawAtMs: 5000 + songTimeS * 1000,
  correctedAtMs: 5000 + songTimeS * 1000,
  receivedAtMs: 5000 + songTimeS * 1000,
  songTimeS,
  receivedSongTimeS: songTimeS,
  ...options
});
const finish = (session: RhythmSession) => {
  session.advance(session.completionTimeS);
  const result = session.result(200);
  if (!result) throw new Error("Expected completed result");
  return result;
};

describe("rhythm onset evaluation", () => {
  it("accepts inclusive ±150ms, excludes +151ms and evaluates only the score range", () => {
    const exercise = generateRhythmExercise(0);
    const session = new RhythmSession(exercise, config);
    expect(session.attack(event(-0.151))).toBeNull();
    expect(session.attack(event(-0.15))?.kind).toBe("hit");
    expect(session.attack(event(0.151))?.kind).toBe("extra");
    const second = exercise.onsets[1];
    if (!second) throw new Error("Missing onset");
    expect(session.attack(event(second.timeS + 0.15))?.kind).toBe("hit");
    expect(session.attack(event(exercise.durationS))).toBeNull();
    expect(session.attack(event(exercise.durationS + 0.1))).toBeNull();
    const result = finish(session);
    expect(result.summary).toMatchObject({
      hits: 2,
      early: 1,
      late: 1,
      misses: 8,
      extras: 1,
      hitRate: 0.2
    });
  });

  it("matches before classifying pauses; extra pause hits are a subset of extras", () => {
    const exercise = generateRhythmExercise(0);
    const session = new RhythmSession(exercise, config);
    const rest = exercise.rests.find((value) =>
      exercise.onsets.some((onset) => onset.timeS === value.endS)
    );
    if (!rest) throw new Error("Missing pause before note");
    const hit = session.attack(event(rest.endS - 0.1));
    expect(hit).toMatchObject({ kind: "hit", inRest: false });
    const extra = session.attack(event(rest.endS - 0.05));
    expect(extra).toMatchObject({ kind: "extra", inRest: true });
    expect(finish(session).summary).toMatchObject({ hits: 1, misses: 9, extras: 1, restExtras: 1 });
  });

  it("chooses the nearest pending onset and never consumes one onset twice", () => {
    const exercise: RhythmExercise = {
      ...generateRhythmExercise(0),
      onsets: [
        { id: "a", timeS: 1 },
        { id: "b", timeS: 1.2 }
      ]
    };
    const session = new RhythmSession(exercise, config);
    expect(session.attack(event(1.15))?.onsetId).toBe("b");
    expect(session.attack(event(1.12))?.onsetId).toBe("a");
    expect(session.attack(event(1.13))?.kind).toBe("extra");
  });

  it("does not finalize misses before delivery closes, including positive compensation", () => {
    const exercise = generateRhythmExercise(0);
    const session = new RhythmSession(exercise, {
      ...config,
      offsets: { ...config.offsets, inputOffsetMs: 200, manualInputOffsetMs: 50 }
    });
    expect(session.deliveryGraceS).toBe(0.5);
    session.advance(0.65);
    expect(session.snapshot().misses).toHaveLength(0);
    const hit = session.attack(
      event(0.1, { rawAtMs: 5350, correctedAtMs: 5100, receivedAtMs: 5600, receivedSongTimeS: 0.6 })
    );
    expect(hit?.kind).toBe("hit");
    expect(hit?.deviationMs).toBeCloseTo(100);
    expect(session.snapshot().misses).toHaveLength(0);
    const other = new RhythmSession(exercise, config);
    other.advance(0.4);
    expect(other.snapshot().misses).toHaveLength(0);
    other.advance(0.40001);
    expect(other.snapshot().misses).toHaveLength(1);
    expect(other.attack(event(0.1, { receivedAtMs: 5350, receivedSongTimeS: 0.35 }))?.kind).toBe(
      "extra"
    );
  });

  it("accepts delayed attacks within the quiet score tail but rejects stale raw delivery", () => {
    const exercise = generateRhythmExercise(0);
    const session = new RhythmSession(exercise, config);
    expect(
      session.attack(
        event(exercise.durationS - 0.05, { receivedAtMs: 21200, receivedSongTimeS: 16.2 })
      )?.kind
    ).toBe("extra");
    expect(
      session.attack(event(0, { rawAtMs: 5000, receivedAtMs: 5251, receivedSongTimeS: 0.251 }))
    ).toBeNull();
    const result = finish(session);
    expect(result.attacks).toHaveLength(1);
    expect(result.summary.misses).toBe(10);
  });

  it("does not expand grace for negative input offsets", () => {
    const session = new RhythmSession(generateRhythmExercise(1), {
      ...config,
      offsets: { ...config.offsets, inputOffsetMs: -100 }
    });
    expect(session.deliveryGraceS).toBe(0.25);
  });

  it("gates source, device, run identity, preparation time and nonfinite timestamps", () => {
    const session = new RhythmSession(generateRhythmExercise(0), config);
    expect(session.attack(event(0, { source: "pointer" }))).toBeNull();
    expect(session.attack(event(0, { runId: "old-run" }))).toBeNull();
    expect(session.attack(event(0, { rawAtMs: 999, receivedAtMs: 1000 }))).toBeNull();
    expect(session.attack(event(0, { rawAtMs: 5500, receivedAtMs: 5000 }))).toBeNull();
    expect(session.attack(event(0, { correctedAtMs: NaN }))).toBeNull();
    const midi = new RhythmSession(generateRhythmExercise(0), {
      ...config,
      source: "midi",
      deviceId: "selected"
    });
    expect(midi.attack(event(0, { source: "midi", deviceId: "other" }))).toBeNull();
    expect(
      midi.attack(event(0, { source: "midi", deviceId: "selected", pitch: 20, channel: 1 }))?.kind
    ).toBe("hit");
    expect(
      midi.attack(event(0, { source: "midi", deviceId: "selected", pitch: 80, channel: 1 }))?.kind
    ).toBe("extra");
  });

  it("requires only one onset for a half note and evaluates fresh attacks during its duration", () => {
    const exercise = generateRhythmExercise(0);
    const half = exercise.song.notes.find((note) => note.duration === 2);
    if (!half) throw new Error("Missing half note");
    const session = new RhythmSession(exercise, config);
    expect(session.attack(event(half.start))?.kind).toBe("hit");
    expect(session.attack(event(half.start + 1))?.kind).toBe("extra");
    expect(finish(session).summary).toMatchObject({ hits: 1, misses: 9, extras: 1 });
  });

  it("completes all-miss runs only after full score and grace with no false zero median", () => {
    const session = new RhythmSession(generateRhythmExercise(0), config);
    session.advance(16);
    expect(session.snapshot().status).toBe("running");
    expect(session.result(200)).toBeNull();
    expect(finish(session)).toMatchObject({
      source: "keyboard",
      summary: { expected: 10, hits: 0, misses: 10, signedMedianMs: null, absoluteMedianMs: null }
    });
    expect(session.snapshot().misses.every((miss) => miss.source === "keyboard")).toBe(true);
  });

  it("records signed and absolute medians only for hits, with zero neither early nor late", () => {
    const exercise = generateRhythmExercise(0);
    const session = new RhythmSession(exercise, config);
    const deviations = [-100, 0, 50, 150];
    exercise.onsets
      .slice(0, 4)
      .forEach((onset, index) =>
        session.attack(event(onset.timeS + (deviations[index] ?? 0) / 1000))
      );
    const result = finish(session);
    expect(result.summary).toMatchObject({
      expected: 10,
      hits: 4,
      early: 1,
      late: 2,
      misses: 6
    });
    expect(result.summary.signedMedianMs).toBeCloseTo(25);
    expect(result.summary.absoluteMedianMs).toBeCloseTo(75);
    expect(result.attacks.map((attack) => attack.attemptId)).toEqual([
      "run-1:0",
      "run-1:1",
      "run-1:2",
      "run-1:3"
    ]);
  });

  it("cancels without producing a result or letting late callbacks revive it", () => {
    const session = new RhythmSession(generateRhythmExercise(0), config);
    session.attack(event(0));
    session.cancel();
    session.advance(100);
    expect(session.snapshot().status).toBe("cancelled");
    expect(session.attack(event(1))).toBeNull();
    expect(session.result(200)).toBeNull();
  });

  it.each([15, 60])("keeps hits identical with a %i FPS receiving clock", (fps) => {
    const exercise = generateRhythmExercise(42, 100);
    const session = new RhythmSession(exercise, config);
    for (const onset of exercise.onsets) {
      const receivedSongTimeS = Math.ceil(onset.timeS * fps) / fps;
      session.advance(receivedSongTimeS);
      expect(
        session.attack(
          event(onset.timeS, { receivedAtMs: 5000 + receivedSongTimeS * 1000, receivedSongTimeS })
        )?.kind
      ).toBe("hit");
    }
    expect(finish(session).summary).toMatchObject({
      hits: 10,
      misses: 0,
      extras: 0,
      signedMedianMs: 0
    });
  });

  it("segregates history by tempo, source, rules and every offset snapshot", () => {
    const base = finish(new RhythmSession(generateRhythmExercise(0), config));
    const otherSource = { ...base, runId: "pointer", source: "pointer" as const };
    const otherTempo = { ...base, runId: "tempo", bpm: 100 as const };
    const otherRules = { ...base, runId: "rules", rulesVersion: 2 };
    const changedOffsets = {
      ...base,
      runId: "offset",
      offsets: { ...base.offsets, visualOffsetMs: 5 }
    };
    const changedStatus = {
      ...base,
      runId: "status",
      offsets: { ...base.offsets, status: "calibrated" as const }
    };
    const groups = summarizeRhythmHistory([
      base,
      { ...base, runId: "same" },
      otherSource,
      otherTempo,
      otherRules,
      changedOffsets,
      changedStatus
    ]);
    expect(groups).toHaveLength(6);
    expect(groups[0]?.summary).toMatchObject({ expected: 20, misses: 20, signedMedianMs: null });
  });
});
