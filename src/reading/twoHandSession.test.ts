// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_READING_PREFERENCES } from "./types";
import { generateTwoHandExercise } from "./twoHandGenerator";
import { TwoHandSession } from "./twoHandSession";
import { validateTwoHandResult } from "./twoHandValidation";
import { summarizeTwoHandResults } from "./twoHandProgress";
import type { TwoHandInput } from "./twoHandTypes";
import { parseMidiMessage } from "../input/midiInput";

function setup() {
  const exercise = generateTwoHandExercise(1);
  const session = new TwoHandSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId: "run",
    startedAt: 1000
  });
  const pair = required(exercise.pairs[0]);
  session.prepare(pair.id, 1000);
  session.present(pair.id, 1000);
  session.setActive(true, 1000);
  const input = (
    kind: "down" | "up",
    pitch: number,
    atMs: number,
    received = atMs,
    extra: Partial<TwoHandInput> = {}
  ) => session.input({ kind, pitch, source: "keyboard", atMs, ...extra }, received);
  return { exercise, session, pair, input };
}
describe("TwoHandSession", () => {
  it("ignores expired offs of an older attack while the new pair is held", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1500);
    input("down", pair.pitches[1], 1510);
    input("up", pair.pitches[0], 1100, 1511);
    expect(session.snapshot().status).toBe("release");
    input("up", pair.pitches[0], 1520);
    input("up", pair.pitches[1], 1530);
    expect(session.tick(1781).answers).toHaveLength(1);
  });
  it("cancels an expired matching off but retains the other physically held key", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1020);
    input("up", pair.pitches[0], 1030, 1281);
    input("down", pair.pitches[0], 1290);
    input("down", pair.pitches[1], 1300);
    input("up", pair.pitches[0], 1310);
    input("up", pair.pitches[1], 1320);
    expect(session.tick(1571).answers).toHaveLength(0);
    input("down", pair.pitches[0], 1600);
    input("down", pair.pitches[1], 1610);
    input("up", pair.pitches[0], 1620);
    input("up", pair.pitches[1], 1630);
    expect(session.tick(1881).answers).toHaveLength(1);
  });
  it.each([false, true])("accepts either order at the inclusive 200ms boundary: %s", (reverse) => {
    const { session, pair, input } = setup();
    const [a, b] = reverse ? pair.pitches.toReversed() : pair.pitches;
    input("down", a, 1010);
    input("down", b, 1210);
    expect(session.snapshot().status).toBe("release");
    expect(session.snapshot().answers).toHaveLength(0);
    input("up", a, 1220);
    input("up", b, 1230);
    expect(session.tick(1480).answers).toHaveLength(0);
    expect(session.tick(1481).answers).toHaveLength(1);
    expect(session.tick(2000).answers).toHaveLength(1);
    expect(session.snapshot().answers[0]?.spreadMs).toBe(200);
  });
  it("replays a late off before the second attack and retries after full release", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1200);
    expect(session.snapshot().status).toBe("release");
    input("up", pair.pitches[0], 1100, 1250);
    expect(session.snapshot().status).toBe("early-release");
    input("up", pair.pitches[1], 1260);
    session.tick(1511);
    expect(session.snapshot().answers).toHaveLength(0);
    input("down", pair.pitches[0], 1520);
    input("down", pair.pitches[1], 1530);
    input("up", pair.pitches[0], 1540);
    input("up", pair.pitches[1], 1550);
    const answer = required(session.tick(1801).answers[0]);
    expect(answer.attempts.map((attempt) => attempt.outcome)).toEqual(["early-release", "success"]);
    expect(answer.independentCorrect).toBe(false);
    expect(answer.unassistedSolved).toBe(true);
  });
  it("handles up delivered before its down", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("up", pair.pitches[1], 1120, 1120);
    input("down", pair.pitches[1], 1100, 1130);
    input("up", pair.pitches[0], 1150);
    expect(session.tick(1401).answers).toHaveLength(1);
  });
  it("retains an up delivered before the first down as prefix evidence", () => {
    const { session, pair, input } = setup();
    input("up", pair.pitches[0], 1100);
    expect(session.snapshot().status).toBe("ready");
    input("down", pair.pitches[1], 1190);
    input("down", pair.pitches[0], 1010, 1200);
    expect(session.snapshot().status).toBe("early-release");
    input("up", pair.pitches[1], 1250);
    input("up", pair.pitches[0], 1260);
    expect(session.tick(1511).answers).toHaveLength(0);
    input("down", pair.pitches[0], 1520);
    input("down", pair.pitches[1], 1530);
    input("up", pair.pitches[0], 1540);
    input("up", pair.pitches[1], 1550);
    expect(session.tick(1801).answers[0]?.attempts.map((a) => a.outcome)).toEqual([
      "early-release",
      "success"
    ]);
  });
  it("retains mixed-origin error even when device offsets differ", () => {
    const { exercise, session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1010, { offsetMs: 0 });
    input("down", pair.pitches[1], 1100, 1100, { source: "midi", offsetMs: 40 });
    expect(session.snapshot().status).toBe("mixed-origin");
    input("up", pair.pitches[0], 1120, 1120, { offsetMs: 0 });
    input("up", pair.pitches[1], 1130, 1130, { source: "midi", offsetMs: 40 });
    session.tick(1381);
    const result = completeFrom(session, exercise, 1500);
    expect(result.pairs[0]?.attempts.map((a) => a.outcome)).toEqual(["mixed-origin", "success"]);
    expect(validateTwoHandResult(result)).toEqual(result);
  });
  it("rejects a fresh restrike of an expected pitch as the third attack", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1100);
    input("up", pair.pitches[0], 1110);
    input("down", pair.pitches[0], 1120);
    expect(session.snapshot().status).toBe("third-note");
    input("up", pair.pitches[0], 1130);
    input("up", pair.pitches[1], 1140);
    expect(session.tick(1391).answers).toHaveLength(0);
  });
  it("seeds pre-existing ownership without creating an answer or synthetic release", () => {
    const { session, pair, input } = setup();
    session.seedHeld(
      [{ kind: "down", pitch: pair.pitches[0], source: "keyboard", atMs: 10 }],
      1001
    );
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1020);
    expect(session.snapshot().status).toBe("ready");
    input("up", pair.pitches[0], 1030);
    input("up", pair.pitches[1], 1040);
    expect(session.tick(1300).answers).toHaveLength(0);
    input("down", pair.pitches[0], 1310);
    input("down", pair.pitches[1], 1320);
    input("up", pair.pitches[0], 1330);
    input("up", pair.pitches[1], 1340);
    expect(session.tick(1591).answers[0]?.firstAttemptCorrect).toBe(true);
  });
  it.each(["wrong-note", "third-note", "mixed-origin", "too-slow"] as const)(
    "records one %s failure",
    (reason) => {
      const { session, pair, input } = setup();
      input("down", pair.pitches[0], 1010);
      const extra = reason === "mixed-origin" ? { source: "midi" as const } : {};
      const secondPitch = reason === "wrong-note" ? pair.pitches[1] + 12 : pair.pitches[1];
      const secondAt = reason === "too-slow" ? 1211 : 1100;
      input("down", secondPitch, secondAt, secondAt, extra);
      if (reason === "third-note") input("down", 61, 1120);
      expect(session.snapshot().status).toBe(reason);
      input("up", pair.pitches[0], 1230);
      input("up", secondPitch, 1240, 1240, extra);
      if (reason === "third-note") input("up", 61, 1250);
      session.tick(1600);
      input("down", pair.pitches[0], 1610);
      input("down", pair.pitches[1], 1620);
      input("up", pair.pitches[0], 1630);
      input("up", pair.pitches[1], 1640);
      expect(session.tick(1891).answers[0]?.attempts.map((a) => a.outcome)).toEqual([
        reason,
        "success"
      ]);
    }
  );
  it("waits for the timeout horizon and rejects future timestamps", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    expect(session.tick(1460).status).toBe("waiting-second");
    expect(session.tick(1461).status).toBe("too-slow");
    input("down", pair.pitches[1], 2000, 1500);
    expect(session.snapshot().answers).toHaveLength(0);
  });
  it("accepts age250 and cancels age251 release without a result", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1260);
    input("down", pair.pitches[1], 1100, 1300);
    expect(session.snapshot().status).toBe("release");
    input("up", pair.pitches[0], 1120, 1371);
    input("up", pair.pitches[1], 1380);
    expect(session.tick(2000).answers).toHaveLength(0);
    input("down", pair.pitches[0], 2010);
    input("down", pair.pitches[1], 2020);
    input("up", pair.pitches[0], 2030);
    input("up", pair.pitches[1], 2040);
    expect(session.tick(2291).answers[0]?.firstAttemptCorrect).toBe(true);
  });
  it("keeps pre-presentation held notes out and cancels provisional success on pause", () => {
    const { session, pair, input } = setup();
    session.requirePresentation(pair.id, 1001);
    input("down", pair.pitches[0], 1002);
    session.present(pair.id, 1010);
    input("down", pair.pitches[1], 1020);
    expect(session.snapshot().status).toBe("ready");
    input("up", pair.pitches[0], 1030);
    input("up", pair.pitches[1], 1040);
    input("down", pair.pitches[0], 1050);
    input("down", pair.pitches[1], 1060);
    session.setActive(false, 1070);
    input("up", pair.pitches[0], 1080);
    input("up", pair.pitches[1], 1090);
    session.setActive(true, 5000);
    expect(session.tick(6000).answers).toHaveLength(0);
    input("down", pair.pitches[0], 6010);
    input("down", pair.pitches[1], 6020);
    input("up", pair.pitches[0], 6030);
    input("up", pair.pitches[1], 6040);
    const answer = required(session.tick(6291).answers[0]);
    expect(answer.firstAttemptCorrect).toBe(true);
    expect(answer.firstLatencyMs).toBeLessThan(1100);
    expect(answer.presentedAtMs).toBe(1000);
  });
  it("retains help shown before finalization and through presentation retry", () => {
    const { session, pair, input } = setup();
    session.showHint(pair.id, 1, 1005);
    session.requirePresentation(pair.id, 1006);
    session.present(pair.id, 1010);
    input("down", pair.pitches[0], 1020);
    input("down", pair.pitches[1], 1030);
    session.showHint(pair.id, 2, 1035);
    input("up", pair.pitches[0], 1040);
    input("up", pair.pitches[1], 1050);
    const answer = required(session.tick(1301).answers[0]);
    expect(answer.hintHistory).toHaveLength(2);
    expect(answer.independentCorrect).toBe(false);
    expect(answer.presentedAtMs).toBe(1000);
  });
  it("ignores held repeats and retains independent pointer ownership", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1010, { source: "pointer", ownerId: "a" });
    input("down", pair.pitches[0], 1011, 1011, { source: "pointer", ownerId: "a" });
    input("down", pair.pitches[0], 1020, 1020, { source: "pointer", ownerId: "b" });
    input("up", pair.pitches[0], 1030, 1030, { source: "pointer", ownerId: "a" });
    input("down", pair.pitches[1], 1040, 1040, { source: "pointer", ownerId: "c" });
    input("up", pair.pitches[1], 1050, 1050, { source: "pointer", ownerId: "c" });
    expect(session.tick(2000).answers).toHaveLength(0);
    input("up", pair.pitches[0], 2010, 2010, { source: "pointer", ownerId: "b" });
    expect(session.tick(2261).answers).toHaveLength(1);
  });
  it("rejects stale run and presentation events", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1010, { runId: "old" });
    input("down", pair.pitches[1], 1020, 1020, { presentationId: "old" });
    expect(session.snapshot().status).toBe("ready");
  });
  it.each([15, 60])("has the same evidence under %i FPS and delayed delivery", (fps) => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1260, { offsetMs: 40 });
    session.tick(1260 + 1000 / fps);
    input("down", pair.pitches[1], 1190, 1440, { offsetMs: 40 });
    input("up", pair.pitches[0], 1200, 1450, { offsetMs: 40 });
    input("up", pair.pitches[1], 1210, 1460, { offsetMs: 40 });
    expect(session.tick(1460 + 1000 / fps).answers[0]?.spreadMs).toBe(180);
  });
  it("does not let cancel or an explicit timing change prove a release", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1020);
    session.cancel(1030);
    input("up", pair.pitches[0], 1040);
    input("up", pair.pitches[1], 1050);
    expect(session.tick(1500).answers).toHaveLength(0);
    input("down", pair.pitches[0], 1510);
    input("down", pair.pitches[1], 1520, 1520, { offsetMs: 10 });
    session.cancel(1521);
    input("up", pair.pitches[0], 1530);
    input("up", pair.pitches[1], 1540);
    expect(session.tick(2000).answers).toHaveLength(0);
  });
  it("rejects MIDI channel mixing while physical releases bypass sustain", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010, 1010, { source: "midi", deviceId: "piano", channel: 1 });
    input("down", pair.pitches[1], 1020, 1020, { source: "midi", deviceId: "piano", channel: 2 });
    expect(session.snapshot().status).toBe("mixed-origin");
    input("up", pair.pitches[0], 1030, 1030, { source: "midi", deviceId: "piano", channel: 1 });
    input("up", pair.pitches[1], 1040, 1040, { source: "midi", deviceId: "piano", channel: 2 });
    session.tick(1291);
    input("down", pair.pitches[0], 1300, 1300, { source: "midi", deviceId: "piano", channel: 1 });
    input("down", pair.pitches[1], 1310, 1310, { source: "midi", deviceId: "piano", channel: 1 });
    input("up", pair.pitches[0], 1320, 1320, { source: "midi", deviceId: "piano", channel: 1 });
    input("up", pair.pitches[1], 1330, 1330, { source: "midi", deviceId: "piano", channel: 1 });
    expect(session.tick(1581).answers[0]?.attempts).toHaveLength(2);
  });
  it("bounds event storage without granting overflow success", () => {
    const { session, pair, input } = setup();
    input("down", pair.pitches[0], 1010);
    input("down", pair.pitches[1], 1020);
    for (let i = 0; i < 255; i++) input("down", pair.pitches[0], 1030 + i);
    expect(session.snapshot().status).toBe("overflow");
    input("up", pair.pitches[0], 1400);
    input("up", pair.pitches[1], 1410);
    expect(session.tick(2000).answers).toHaveLength(0);
  });
});
function completed() {
  const { exercise, session } = setup();
  return completeFrom(session, exercise, 1000);
}
function completeFrom(
  session: TwoHandSession,
  exercise: ReturnType<typeof generateTwoHandExercise>,
  startAt: number
) {
  let at = startAt;
  for (const pair of exercise.pairs) {
    session.prepare(pair.id, at);
    session.present(pair.id, at);
    session.input(
      { kind: "down", pitch: pair.pitches[0], source: "keyboard", atMs: at + 10 },
      at + 10
    );
    session.input(
      { kind: "down", pitch: pair.pitches[1], source: "keyboard", atMs: at + 110 },
      at + 110
    );
    session.input(
      { kind: "up", pitch: pair.pitches[0], source: "keyboard", atMs: at + 120 },
      at + 120
    );
    session.input(
      { kind: "up", pitch: pair.pitches[1], source: "keyboard", atMs: at + 130 },
      at + 130
    );
    session.tick(at + 381);
    at += 500;
  }
  return required(session.result("result", 2000));
}
describe("two-hand evidence and summary", () => {
  it("accepts actual channel16 MIDI messages through a full series and stored evidence", () => {
    const { exercise, session } = setup();
    const midi = (kind: "down" | "up", pitch: number, atMs: number) => {
      const parsed = required(
        parseMidiMessage(
          new Uint8Array([kind === "down" ? 0x9f : 0x8f, pitch, kind === "down" ? 80 : 0])
        )
      );
      if (parsed.type === "pedal") throw new Error("Expected physical key event");
      expect(parsed.channel).toBe(16);
      session.input(
        {
          kind: parsed.type,
          pitch: parsed.pitch,
          channel: required(parsed.channel),
          source: "midi",
          deviceId: "piano",
          atMs
        },
        atMs
      );
    };
    session.seedHeld(
      [
        {
          kind: "down",
          pitch: exercise.pairs[0]?.pitches[0] ?? 48,
          source: "midi",
          channel: 16,
          deviceId: "piano",
          atMs: 10
        }
      ],
      1000
    );
    midi("up", exercise.pairs[0]?.pitches[0] ?? 48, 1001);
    let atMs = 1010;
    for (const pair of exercise.pairs) {
      session.prepare(pair.id, atMs);
      session.present(pair.id, atMs);
      midi("down", pair.pitches[0], atMs + 10);
      midi("down", pair.pitches[1], atMs + 110);
      midi("up", pair.pitches[0], atMs + 120);
      midi("up", pair.pitches[1], atMs + 130);
      session.tick(atMs + 381);
      atMs += 500;
    }
    const result = required(session.result("channel16", 2000));
    expect(result.pairs.every((pair) => pair.independentCorrect)).toBe(true);
    expect(validateTwoHandResult(result)).toEqual(result);
    const invalid = JSON.parse(JSON.stringify(result)) as {
      pairs: { attempts: { events: { channel: number }[] }[] }[];
    };
    required(required(required(invalid.pairs[0]).attempts[0]).events[0]).channel = 0;
    expect(validateTwoHandResult(invalid)).toBeNull();
  });
  it.each([0, 17])(
    "excludes invalid supplied MIDI channel%i from ownership and evidence",
    (channel) => {
      const { session, pair, input } = setup();
      session.seedHeld(
        [{ kind: "down", pitch: pair.pitches[0], source: "midi", channel, atMs: 10 }],
        1000
      );
      input("down", pair.pitches[0], 1010, 1010, { source: "midi", channel });
      expect(session.snapshot().status).toBe("ready");
      input("down", pair.pitches[0], 1020);
      input("down", pair.pitches[1], 1030);
      input("up", pair.pitches[0], 1040);
      input("up", pair.pitches[1], 1050);
      expect(session.tick(1301).answers[0]?.independentCorrect).toBe(true);
    }
  );
  it("validates all ten physical proofs and rejects tampered evidence/metrics", () => {
    const result = completed();
    expect(validateTwoHandResult(result)).toEqual(result);
    const invalid = JSON.parse(JSON.stringify(result)) as {
      pairs: { attempts: { events: unknown[] }[] }[];
    };
    required(required(invalid.pairs[0]).attempts[0]).events.pop();
    expect(validateTwoHandResult(invalid)).toBeNull();
    const metrics = JSON.parse(JSON.stringify(result)) as { pairs: { spreadMs: number }[] };
    required(metrics.pairs[0]).spreadMs = 0;
    expect(validateTwoHandResult(metrics)).toBeNull();
    expect(validateTwoHandResult({ ...result, seed: 2 })).toBeNull();
    expect(validateTwoHandResult({ ...result, pairs: result.pairs.slice(0, 9) })).toBeNull();
  });
  it("summarizes without manufacturing medians and deduplicates runs", () => {
    const result = completed();
    expect(summarizeTwoHandResults([]).spreadMs).toBeNull();
    expect(summarizeTwoHandResults([result, result]).pairCount).toBe(10);
    expect(summarizeTwoHandResults([result]).independentCount).toBe(10);
    expect(summarizeTwoHandResults([result], "midi").independentLatencyMs).toBeNull();
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing test value");
  return value;
}
