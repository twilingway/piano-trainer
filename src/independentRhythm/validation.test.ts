// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateIndependentRhythmExercise } from "./generator";
import { createIndependentRhythmResult } from "./result";
import { rhythmHarness, successfulIndependentRhythmResult } from "./testSupport";
import { summarizeIndependentRhythmResults } from "./progress";
import { validateIndependentRhythmResult } from "./validation";

describe("strict independent rhythm replay", () => {
  it("replays exactly 32 actual preparation receipts and rejects a 33rd receipt", () => {
    const original = successfulIndependentRhythmResult();
    const help = Array.from({ length: 32 }, () => ({
      presentationId: original.pulse.config.presentationId,
      atMs: original.pulse.presentedAtMs,
      pitches: [48, 60]
    }));
    const result = { ...original, pulse: { ...original.pulse, help } };
    expect(validateIndependentRhythmResult(result)).toEqual(result);
    expect(
      validateIndependentRhythmResult({
        ...result,
        pulse: { ...result.pulse, help: [...help, ...help.slice(0, 1)] }
      })
    ).toBeNull();
  });
  it("accepts complete proofs and returns detached deeply copied data", () => {
    const result = successfulIndependentRhythmResult();
    const validated = validateIndependentRhythmResult(result);
    expect(validated).toEqual(result);
    expect(validated).not.toBe(result);
    expect(validated?.series.events).not.toBe(result.series.events);
    expect(result.series.summary).toMatchObject({
      left: { hits: 12 },
      right: { hits: 12 },
      spreadMs: 0
    });
  });
  it.each([
    [
      "generator version",
      (value: Record<string, unknown>) => {
        value.generatorVersion = 2;
      }
    ],
    [
      "rules version",
      (value: Record<string, unknown>) => {
        value.rulesVersion = 2;
      }
    ],
    [
      "seed",
      (value: Record<string, unknown>) => {
        value.seed = 1;
      }
    ],
    [
      "result identity",
      (value: Record<string, unknown>) => {
        value.id = "fake";
      }
    ],
    [
      "origin",
      (value: Record<string, unknown>) => {
        value.inputSource = "midi";
      }
    ],
    [
      "unknown field",
      (value: Record<string, unknown>) => {
        value.fake = true;
      }
    ]
  ])("rejects changed %s", (_, mutate) => {
    const value = JSON.parse(JSON.stringify(successfulIndependentRhythmResult())) as Record<
      string,
      unknown
    >;
    mutate(value);
    expect(validateIndependentRhythmResult(value)).toBeNull();
  });
  it.each([
    [
      "XML",
      (value: Record<string, unknown>) => {
        value.musicXml = "fake";
      }
    ],
    [
      "fingerprint",
      (value: Record<string, unknown>) => {
        value.scoreFingerprint = "fake";
      }
    ],
    [
      "permit",
      (value: Record<string, unknown>) => {
        value.passed = false;
      }
    ],
    [
      "missing attacks",
      (value: Record<string, unknown>) => {
        value.events = [];
      }
    ],
    [
      "metrics",
      (value: Record<string, unknown>) => {
        value.summary = {};
      }
    ],
    [
      "note IDs",
      (value: Record<string, unknown>) => {
        value.outcomes = [];
      }
    ],
    [
      "end deadline",
      (value: Record<string, unknown>) => {
        value.finalizedAtMs = 13250;
      }
    ],
    [
      "channel",
      (value: Record<string, unknown>) => {
        value.channel = 5;
      }
    ],
    [
      "unknown phase field",
      (value: Record<string, unknown>) => {
        value.fake = true;
      }
    ]
  ])("rejects changed pulse %s", (_, mutate) => {
    const value = JSON.parse(JSON.stringify(successfulIndependentRhythmResult())) as {
      pulse: Record<string, unknown>;
    };
    mutate(value.pulse);
    expect(validateIndependentRhythmResult(value)).toBeNull();
  });
  it("rejects fabricated clock jumps, speed, freshness, origin, offset and help receipts", () => {
    const fixture = successfulIndependentRhythmResult();
    const mutations = [
      (value: typeof fixture) => {
        const event = value.series.events[0];
        if (event) Object.assign(event, { atMs: event.atMs - 251 });
      },
      (value: typeof fixture) => {
        const event = value.series.events[0];
        if (event) Object.assign(event, { runId: "other" });
      },
      (value: typeof fixture) => {
        const event = value.series.events[0];
        if (event) Object.assign(event, { offsetMs: 1 });
      },
      (value: typeof fixture) => {
        Object.assign(value.series.config, { presentationId: value.pulse.config.presentationId });
      },
      (value: typeof fixture) => {
        const last = value.series.clock.segments.at(-1);
        if (last) Object.assign(last, { songSeconds: -3 });
      },
      (value: typeof fixture) => {
        const last = value.series.clock.segments.at(-1);
        if (last) Object.assign(last, { speed: 2 });
      },
      (value: typeof fixture) => {
        Object.assign(value.series.clock, { endPerformanceMs: 0 });
      },
      (value: typeof fixture) => {
        Object.assign(value.series, {
          help: [
            {
              presentationId: value.series.config.presentationId,
              atMs: value.series.startedAtMs + 1,
              pitches: [48, 60]
            }
          ]
        });
      }
    ];
    for (const mutate of mutations) {
      const value = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
      mutate(value);
      expect(validateIndependentRhythmResult(value)).toBeNull();
    }
  });
  it("stores series errors after a valid pulse and leaves empty medians unknown", () => {
    const fixture = successfulIndependentRhythmResult();
    const exercise = generateIndependentRhythmExercise(0);
    const series = rhythmHarness(
      exercise.series,
      fixture.series.config,
      fixture.series.startedAtMs
    );
    series.attack(36, 0);
    series.finish();
    const proof = series.session.result();
    expect(proof).not.toBeNull();
    if (!proof) throw new Error("missing proof");
    const result = createIndependentRhythmResult(exercise, fixture.pulse, proof, {
      startedAt: 1,
      completedAt: 2
    });
    expect(result?.series.summary).toMatchObject({
      left: { misses: 12, signedDeviationMs: null, absoluteDeviationMs: null },
      right: { misses: 12 },
      unknownExtras: 1,
      spreadMs: null
    });
    expect(result?.series.passed).toBe(false);
  });
  it("validates selected MIDI channel across the two phases", () => {
    const exercise = generateIndependentRhythmExercise(3);
    const pulse = rhythmHarness(exercise.pulse, {
      runId: "m",
      presentationId: "m:p",
      source: "midi",
      deviceId: "device",
      offsetMs: 100
    });
    pulse.solve();
    pulse.finish();
    const p = pulse.session.result();
    if (!p) throw new Error("pulse");
    const series = rhythmHarness(
      exercise.series,
      { ...p.config, presentationId: "m:s", channel: p.channel ?? 1 },
      p.finalizedAtMs + 100
    );
    series.solve();
    series.finish();
    const s = series.session.result();
    if (!s) throw new Error("series");
    const result = createIndependentRhythmResult(exercise, p, s, { startedAt: 1, completedAt: 2 });
    expect(result?.inputSource).toBe("midi");
    if (!result) throw new Error("result");
    const wrong = JSON.parse(JSON.stringify(result)) as typeof result;
    Object.assign(wrong.series.config, { channel: 2 });
    expect(validateIndependentRhythmResult(wrong)).toBeNull();
  });
  it("summarizes filtered complete series without losing unknown extras or empty samples", () => {
    const result = successfulIndependentRhythmResult();
    expect(summarizeIndependentRhythmResults([result], "keyboard")).toMatchObject({
      resultCount: 1,
      left: { expected: 12, hits: 12 },
      right: { hits: 12 }
    });
    expect(summarizeIndependentRhythmResults([result], "midi")).toMatchObject({
      resultCount: 0,
      left: { expected: 0, signedDeviationMs: null },
      spreadMs: null
    });
  });
});
