// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateIndependentRhythmExercise } from "./generator";
import { IndependentRhythmPhaseSession } from "./session";
import { rhythmHarness } from "./testSupport";

const exercise = generateIndependentRhythmExercise(0);
describe("independent tempo evaluator", () => {
  it("opens the pulse only after actual end and the strict delivery deadline", () => {
    const run = rhythmHarness(exercise.pulse);
    run.solve();
    expect(run.session.snapshot().summary.right.hits).toBe(8);
    expect(run.session.snapshot().finished).toBe(false);
    run.frame(13000);
    expect(run.session.result()).toBeNull();
    run.frame(13250);
    expect(run.session.result()).toBeNull();
    run.frame(13251);
    expect(run.session.result()?.passed).toBe(true);
  });
  it("can revoke eight preliminary pulse hits with an extra delivered during finalization", () => {
    const run = rhythmHarness(exercise.pulse);
    run.solve();
    run.frame(13000);
    run.send({ kind: "down", pitch: 61, atMs: 12990 }, 13240);
    run.finish();
    expect(run.session.result()).toMatchObject({
      passed: false,
      summary: { right: { hits: 8 }, unknownExtras: 1 }
    });
  });
  it.each([-150, 150, -151, 151])(
    "uses inclusive ±150 boundaries for later onsets (%s)",
    (deviation) => {
      const run = rhythmHarness(exercise.series);
      run.attack(60, 1000 + deviation);
      run.finish();
      expect(run.session.result()?.summary.right.hits).toBe(Math.abs(deviation) <= 150 ? 1 : 0);
      expect(run.session.result()?.summary.extras).toBe(Math.abs(deviation) <= 150 ? 0 : 1);
    }
  );
  it("ignores first−151 and accepts first−150 during actual count-in", () => {
    const run = rhythmHarness(exercise.pulse);
    run.attack(60, -151);
    run.attack(60, -150 + 20);
    run.finish();
    expect(run.session.result()).toMatchObject({ summary: { right: { hits: 1 }, extras: 0 } });
    const boundary = rhythmHarness(exercise.pulse);
    boundary.attack(60, -150);
    boundary.finish();
    expect(boundary.session.result()?.outcomes[0]?.deviationMs).toBe(-150);
  });
  it.each([false, true])(
    "grades joint notes independently in either delivery order (reverse=%s)",
    (reverse) => {
      const run = rhythmHarness(exercise.series);
      for (const pitch of reverse ? [60, 48] : [48, 60])
        run.send({ kind: "down", pitch, atMs: 5000 });
      run.finish();
      expect(run.session.result()?.summary).toMatchObject({
        left: { hits: 1 },
        right: { hits: 1 },
        spreadMs: 0
      });
    }
  );
  it("allows 300ms joint spread without the pair-course 200ms guard", () => {
    const run = rhythmHarness(exercise.series);
    run.attack(48, 1850);
    run.attack(60, 2150);
    run.finish();
    expect(run.session.result()?.summary).toMatchObject({
      left: { hits: 1 },
      right: { hits: 1 },
      spreadMs: 300
    });
  });
  it("leaves twelve left misses when only the right hand played; wrong octave has unknown hand", () => {
    const run = rhythmHarness(exercise.series);
    for (const note of exercise.series.song.notes.filter((note) => note.hand === "right"))
      run.attack(note.pitch, note.start * 1000);
    run.attack(36, 15500);
    run.finish();
    expect(run.session.result()?.summary).toMatchObject({
      left: { hits: 0, misses: 12 },
      right: { hits: 12 },
      extras: 1,
      unknownExtras: 1,
      spreadMs: null
    });
  });
  it("does not grade up duration and blocks repeated downs until every owner released", () => {
    const run = rhythmHarness(exercise.pulse);
    run.send({ kind: "down", pitch: 60, atMs: 5000, ownerId: "a" });
    run.send({ kind: "down", pitch: 60, atMs: 5001, ownerId: "b" });
    run.send({ kind: "up", pitch: 60, atMs: 5010, ownerId: "a" });
    run.send({ kind: "down", pitch: 60, atMs: 6000, ownerId: "a" });
    run.send({ kind: "up", pitch: 60, atMs: 6010, ownerId: "a" });
    run.send({ kind: "up", pitch: 60, atMs: 6020, ownerId: "b" });
    run.attack(60, 2000);
    run.finish();
    expect(run.session.result()?.summary.right.hits).toBe(2);
    expect(run.session.result()?.summary.extras).toBe(0);
  });
  it("requires release before manual start and never returns a cancelled proof", () => {
    const session = new IndependentRhythmPhaseSession(exercise.pulse, {
      runId: "r",
      presentationId: "p",
      source: "keyboard",
      offsetMs: 0
    });
    session.present(100);
    session.seedHeld([{ kind: "down", source: "keyboard", pitch: 60, atMs: 0 }], 100);
    expect(session.start(200)).toBe(false);
    session.input({ kind: "up", source: "keyboard", pitch: 60, atMs: 210 }, 210);
    expect(session.start(220)).toBe(true);
    session.cancel(300);
    expect(session.result()).toBeNull();
    expect(session.start(400)).toBe(false);
  });
  it("ignores future/251ms attacks but accepts age250", () => {
    const run = rhythmHarness(exercise.pulse);
    run.send({ kind: "down", pitch: 60, atMs: 5001 }, 5000);
    run.send({ kind: "down", pitch: 60, atMs: 5000 }, 5251);
    run.send({ kind: "down", pitch: 60, atMs: 6000 }, 6250);
    run.finish();
    expect(run.session.result()?.summary.right.hits).toBe(1);
  });
  it("a stale matching up cancels, while an older off cannot clear a fresh owner", () => {
    const run = rhythmHarness(exercise.pulse);
    run.send({ kind: "down", pitch: 60, atMs: 5000 });
    run.send({ kind: "up", pitch: 60, atMs: 4999 }, 5250);
    expect(run.session.snapshot().active).toBe(true);
    run.send({ kind: "up", pitch: 60, atMs: 5000 }, 5251);
    expect(run.session.snapshot().status).toBe("cancelled");
  });
  it("preserves prefix releases when an older raw down arrives later", () => {
    const run = rhythmHarness(exercise.pulse);
    run.send({ kind: "up", pitch: 60, atMs: 5010 }, 5010);
    run.send({ kind: "down", pitch: 60, atMs: 5000 }, 5100);
    run.send({ kind: "down", pitch: 60, atMs: 6000 }, 6000);
    run.finish();
    expect(run.session.result()?.summary.right.hits).toBe(2);
  });
  it.each([1000, -1000])(
    "uses fixed corrected timestamps, conservative misses and actual end for offset%s",
    (offsetMs) => {
      const run = rhythmHarness(exercise.pulse, {
        runId: "r",
        presentationId: "p",
        source: "keyboard",
        offsetMs
      });
      run.frame(5150);
      expect(run.session.snapshot().outcomes[0]?.outcome).toBe("pending");
      run.frame(5400 + Math.max(0, offsetMs));
      expect(run.session.snapshot().outcomes[0]?.outcome).toBe("pending");
      run.frame(5401 + Math.max(0, offsetMs));
      expect(run.session.snapshot().outcomes[0]?.outcome).toBe("miss");
      run.frame(13000);
      expect(run.session.result()).toBeNull();
      run.finish();
      expect(run.session.result()).not.toBeNull();
    }
  );
  it("accepts positive-offset late down after actual end when corrected time is inside phase", () => {
    const run = rhythmHarness(exercise.pulse, {
      runId: "r",
      presentationId: "p",
      source: "keyboard",
      offsetMs: 1000
    });
    run.frame(13000);
    run.send({ kind: "down", pitch: 61, atMs: 13999 }, 14249);
    run.finish();
    expect(run.session.result()?.summary.unknownExtras).toBe(1);
  });
  it("latches MIDI origin by first delivered fresh graded down even wrong pitch", () => {
    const run = rhythmHarness(exercise.pulse, {
      runId: "r",
      presentationId: "p",
      source: "midi",
      deviceId: "m",
      offsetMs: 0
    });
    run.send({ kind: "down", pitch: 62, atMs: 5000, channel: 2 });
    run.send({ kind: "down", pitch: 60, atMs: 4990, channel: 1 }, 5010);
    run.send({ kind: "up", pitch: 62, atMs: 5020, channel: 2 });
    run.attack(60, 1000, { channel: 2 });
    run.finish();
    expect(run.session.result()).toMatchObject({
      channel: 2,
      summary: { right: { hits: 1 }, unknownExtras: 1 }
    });
  });
  it("does not latch MIDI in preparation or grade another source/device", () => {
    const run = rhythmHarness(exercise.pulse, {
      runId: "r",
      presentationId: "p",
      source: "midi",
      deviceId: "m",
      offsetMs: 0
    });
    run.attack(60, -1000, { channel: 2 });
    run.attack(60, 0, { deviceId: "other", channel: 3 });
    run.attack(60, 1000, { source: "keyboard" });
    run.attack(60, 2000, { channel: 4 });
    run.finish();
    expect(run.session.result()).toMatchObject({
      channel: 4,
      summary: { right: { hits: 1 }, extras: 0 }
    });
  });
  it.each([15, 60])("has identical onset outcomes with actual PracticeSession at %sFPS", (fps) => {
    const run = rhythmHarness(exercise.series);
    for (let second = 0; second < 16; second++) {
      for (let frame = 0; frame < fps; frame++)
        run.frame(1000 + second * 1000 + (frame * 1000) / fps);
    }
    run.finish();
    expect(run.session.result()?.summary).toMatchObject({
      left: { hits: 0, misses: 12 },
      right: { hits: 0, misses: 12 }
    });
  });
  it.each([15, 60])("keeps all 24 actual-clock hits at %sFPS", (fps) => {
    const run = rhythmHarness(exercise.series);
    const events = exercise.series.song.notes
      .flatMap((note) => [
        { kind: "down" as const, pitch: note.pitch, atMs: 5000 + note.start * 1000 },
        { kind: "up" as const, pitch: note.pitch, atMs: 5010 + note.start * 1000 }
      ])
      .toSorted((a, b) => a.atMs - b.atMs);
    let frame = 1000;
    for (const event of events) {
      while (frame <= event.atMs) {
        run.frame(frame);
        frame += 1000 / fps;
      }
      run.send(event);
    }
    run.finish();
    expect(run.session.result()?.summary).toMatchObject({
      left: { hits: 12, misses: 0 },
      right: { hits: 12, misses: 0 },
      spreadMs: 0
    });
  });
  it("cancels on a paused clock or changed calibration without a resumable permit", () => {
    const paused = rhythmHarness(exercise.pulse);
    paused.practice.pauseClock(5000);
    paused.frame(5000);
    expect(paused.session.snapshot().status).toBe("cancelled");
    expect(paused.session.result()).toBeNull();
    const changed = rhythmHarness(exercise.pulse);
    changed.send({ kind: "down", pitch: 60, atMs: 5000, offsetMs: 1 });
    expect(changed.session.snapshot().status).toBe("cancelled");
  });
  it("does not clear another owner on local cancellation and stale up", () => {
    const run = rhythmHarness(exercise.pulse);
    run.send({ kind: "down", pitch: 60, atMs: 5000, ownerId: "a" });
    run.send({ kind: "down", pitch: 48, atMs: 5000, ownerId: "b" });
    run.session.cancel(5100);
    run.send({ kind: "up", pitch: 60, atMs: 5000, ownerId: "a" }, 5251);
    expect(run.session.snapshot().blocked).toBe(true);
    run.send({ kind: "up", pitch: 48, atMs: 5300, ownerId: "b" });
    expect(run.session.snapshot().blocked).toBe(false);
  });
  it("rejects altered clock prefixes and clock overflow instead of trusting a short proof", () => {
    const run = rhythmHarness(exercise.pulse);
    const receipt = run.practice.tempoClockReceipt(2000);
    run.session.tick(2000, {
      ...receipt,
      segments: receipt.segments.map((segment, index) =>
        index === 0 ? { ...segment, acceptsInput: false } : segment
      )
    });
    expect(run.session.snapshot().status).toBe("cancelled");
    const overflow = rhythmHarness(exercise.pulse);
    const actual = overflow.practice.tempoClockReceipt(2000);
    overflow.session.tick(2000, {
      ...actual,
      segments: Array.from({ length: 65 }, () => ({
        performanceMs: 900,
        songSeconds: -4,
        speed: 1,
        acceptsInput: true
      }))
    });
    expect(overflow.session.snapshot().status).toBe("overflow");
  });
  it("records only actual preparation help and overflows the bounded receipt budget", () => {
    const config = { runId: "r", presentationId: "p", source: "keyboard" as const, offsetMs: 0 };
    const session = new IndependentRhythmPhaseSession(exercise.pulse, config);
    session.present(100);
    for (let index = 0; index < 32; index++) session.showKeys([48, 60], 100 + index);
    expect(session.snapshot().status).toBe("overflow");
    expect(session.start(200)).toBe(false);
  });
  it("overflow cancels without a truncated result", () => {
    const run = rhythmHarness(exercise.pulse);
    for (let index = 0; index < 257; index++)
      run.send({ kind: index % 2 ? "up" : "down", pitch: 60, atMs: 5000 + index });
    run.finish();
    expect(run.session.snapshot().status).toBe("overflow");
    expect(run.session.result()).toBeNull();
  });
});
