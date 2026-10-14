// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { PracticeSession } from "../practice/session";
import { DEFAULT_READING_PREFERENCES } from "./types";
import { generateHeldBassExercise, nextHeldBassSeed } from "./heldBassGenerator";
import { HeldBassSession } from "./heldBassSession";
import { validateHeldBassResult } from "./heldBassValidation";
import { summarizeHeldBassResults } from "./heldBassProgress";
import type {
  HeldBassExercise,
  HeldBassFragment,
  HeldBassInput,
  HeldBassResult
} from "./heldBassTypes";

export class HeldBassHarness {
  readonly exercise: HeldBassExercise;
  readonly core: HeldBassSession;
  practice!: PracticeSession;
  fragment!: HeldBassFragment;
  now = 1000;
  constructor(
    seed = 1,
    readonly offset = 0,
    readonly source: HeldBassInput["source"] = "keyboard"
  ) {
    this.exercise = generateHeldBassExercise(seed);
    this.core = new HeldBassSession(this.exercise, DEFAULT_READING_PREFERENCES, {
      runId: "fixture-run",
      startedAt: 10000
    });
  }
  prepare(index: number): void {
    const fragment = this.exercise.fragments[index];
    if (!fragment) throw new Error("Missing fragment");
    this.fragment = fragment;
    this.core.prepare(fragment.id, this.now);
    this.core.setActive(true, this.now);
    this.core.present(fragment.id, this.now);
    this.practice = new PracticeSession(fragment.song, {
      mode: "wait",
      speed: 1,
      hands: new Set(["left", "right"]),
      accompaniment: false,
      noteResult: false,
      countInBeats: 0
    });
    expect(
      this.practice.registerVerifiedOnsets({
        runId: "fixture-run",
        presentationId: this.core.snapshot().presentationId ?? "",
        fragmentId: fragment.id,
        steps: fragment.steps
      })
    ).toBe(true);
    this.practice.startClock(this.now);
    this.frame(this.now);
  }
  frame(atMs: number, commit = true): void {
    this.now = atMs;
    this.practice.tick(atMs);
    const snapshot = this.core.tick(atMs, this.practice.clockReceipt(atMs));
    if (snapshot.pendingCommit && commit) {
      const request = snapshot.pendingCommit;
      const accepted = this.practice.commitVerifiedOnset(request, atMs) !== undefined;
      expect(accepted).toBe(true);
      this.core.acknowledgeOnset(request, accepted, this.practice.clockReceipt(atMs));
    }
  }
  event(
    kind: "down" | "up",
    pitch: number,
    atMs: number,
    receivedAtMs = atMs,
    extra: Partial<HeldBassInput> = {}
  ): void {
    this.now = Math.max(this.now, receivedAtMs);
    this.core.input(
      { kind, pitch, atMs, source: this.source, offsetMs: this.offset, ...extra },
      receivedAtMs,
      this.practice.clockReceipt(receivedAtMs)
    );
  }
  initial(spread = 50, reverse = false): number {
    const first = reverse ? (this.fragment.melodyPitches[0] ?? 60) : this.fragment.bassPitch;
    const second = reverse ? this.fragment.bassPitch : (this.fragment.melodyPitches[0] ?? 60);
    const start = this.now + 10 + Math.max(0, this.offset);
    this.event("down", first, start);
    this.event("down", second, start + spread);
    this.frame(start + spread + 251);
    return start + spread + 251;
  }
  reachTerminal(): { readonly rawEnd: number; readonly lastPitch: number } {
    this.initial();
    let previous = this.fragment.melodyPitches[0] ?? 60;
    for (let step = 1; step < this.fragment.steps.length; step++) {
      const attack = this.now + 500 + Math.max(0, this.offset);
      this.frame(attack);
      this.event("up", previous, attack);
      const pitch = this.fragment.melodyPitches[step] ?? 60;
      this.event("down", pitch, attack + 1);
      this.frame(attack + 252);
      previous = pitch;
    }
    return { rawEnd: this.now + 500 + this.offset, lastPitch: previous };
  }
  finish(): void {
    const { rawEnd, lastPitch } = this.reachTerminal();
    this.frame(Math.max(rawEnd, this.now + 500));
    expect(this.core.snapshot().status).toBe("release");
    this.event("up", lastPitch, rawEnd, this.now);
    this.event("up", this.fragment.bassPitch, rawEnd, this.now);
    this.frame(rawEnd + 251);
    expect(this.core.snapshot().answers.length).toBeGreaterThan(0);
  }
}
export function completeHeldBassFixture(seed = 1, offset = 0): HeldBassResult {
  const harness = new HeldBassHarness(seed, offset);
  for (let index = 0; index < 10; index++) {
    harness.prepare(index);
    harness.finish();
    harness.now++;
  }
  const result = harness.core.result(20000);
  if (!result) throw new Error("Missing result");
  return result;
}
describe("held-bass course generator and journal", () => {
  it("has five short and five long real score fragments, quota2 bass and no fingers/names", () => {
    for (let seed = 0; seed < 20; seed++) {
      const exercise = generateHeldBassExercise(seed);
      expect(
        exercise.fragments.filter((fragment) => fragment.melodyPitches.length === 2)
      ).toHaveLength(5);
      expect(
        exercise.fragments.filter((fragment) => fragment.melodyPitches.length === 4)
      ).toHaveLength(5);
      for (const pitch of [48, 50, 52, 53, 55])
        expect(exercise.fragments.filter((fragment) => fragment.bassPitch === pitch)).toHaveLength(
          2
        );
      for (const fragment of exercise.fragments) {
        expect(fragment.song.duration).toBe(fragment.steps.length * 0.5);
        expect(fragment.song.notes.find((note) => note.id === fragment.bassNoteId)?.duration).toBe(
          fragment.song.duration
        );
        expect(
          fragment.song.notes.filter((note) => note.hand === "right").map((note) => note.id)
        ).toEqual(fragment.melodyNoteIds);
        expect(fragment.musicXml).not.toMatch(/fingering|lyric/);
        expect(fragment.melodyPitches.every((pitch) => [60, 62, 64, 65, 67].includes(pitch))).toBe(
          true
        );
      }
      expect(exercise.fragments).toEqual(generateHeldBassExercise(seed).fragments);
      expect(generateHeldBassExercise(nextHeldBassSeed(seed)).fragments).not.toEqual(
        exercise.fragments
      );
    }
    expect(() => generateHeldBassExercise(1, 2)).toThrow();
  });
  it.each([0, 100, -50])(
    "completes both lengths with actual sole-clock proof, offset %i",
    (offset) => {
      const result = completeHeldBassFixture(1, offset);
      expect(result.fragments).toHaveLength(10);
      expect(result.fragments.every((fragment) => fragment.independentCorrect)).toBe(true);
      expect(validateHeldBassResult(result)).toEqual(result);
      expect(summarizeHeldBassResults([result])).toMatchObject({
        fragmentCount: 10,
        errorCount: 0,
        independentCount: 10
      });
      expect(summarizeHeldBassResults([result], "midi")).toMatchObject({
        fragmentCount: 0,
        spreadMs: null,
        heldDurationMs: null
      });
    }
  );
  it("accepts either initial order and exactly200, rejects201 without half commit", () => {
    for (const reverse of [false, true]) {
      const h = new HeldBassHarness();
      h.prepare(0);
      h.initial(200, reverse);
      expect(h.core.snapshot().step).toBe(1);
    }
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial(201);
    expect(h.core.snapshot()).toMatchObject({ step: 0, status: "too-slow", pendingCommit: null });
  });
  it("never ages a waiting song into a finished hold", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial();
    h.frame(h.now + 10000);
    expect(h.practice.time).toBe(0.5);
    expect(h.core.snapshot().answers).toHaveLength(0);
    h.event("up", h.fragment.bassPitch, h.now + 1);
    expect(h.core.snapshot().status).toBe("early-release");
  });
  it("rejects future melody at its raw corrected timestamp despite delayed delivery after onset", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial();
    const end = h.now + 500;
    h.event("up", h.fragment.melodyPitches[0] ?? 60, end - 20);
    h.event("down", h.fragment.melodyPitches[1] ?? 60, end - 1, end + 100);
    expect(h.core.snapshot().status).toBe("early-melody");
  });
  it("cancels matching expired off only, waits for remaining physical owner", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial();
    h.event("up", h.fragment.bassPitch, h.now + 1, h.now + 252);
    expect(h.core.snapshot()).toMatchObject({ answers: [], retryCommand: null });
    h.event("up", h.fragment.melodyPitches[0] ?? 60, h.now + 1);
    expect(h.core.snapshot().retryCommand?.fragmentId).toBe(h.fragment.id);
  });
  it("pausing or local cancellation preserves owners and causes fresh fragment without an error", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial();
    h.core.setActive(false, h.now + 1);
    h.core.setActive(true, h.now + 2);
    h.event("up", h.fragment.bassPitch, h.now + 3);
    expect(h.core.snapshot().retryCommand).toBeNull();
    h.event("up", h.fragment.melodyPitches[0] ?? 60, h.now + 4);
    expect(h.core.snapshot().retryCommand).not.toBeNull();
    h.now++;
    h.prepare(0);
    h.finish();
    expect(h.core.snapshot().answers[0]?.attempts).toHaveLength(1);
  });
  it("actual shown help belongs to whole fragment and never leaks to the next step", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.frame(h.now + 5000);
    expect(h.core.suggestHint(h.now)).toBe(1);
    h.core.showHint(h.fragment.id, 0, 1, h.now);
    expect(h.core.snapshot().hintLevel).toBe(1);
    h.initial();
    expect(h.core.snapshot().hintLevel).toBe(0);
    expect(h.core.suggestHint(h.now + 100)).toBe(0);
    h.core.showHint(h.fragment.id, 0, 2, h.now + 1);
    expect(h.core.snapshot().hintLevel).toBe(0);
  });
  it("retains visible help for the same step across retry without revealing another step", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.core.showHint(h.fragment.id, 0, 1, h.now);
    h.initial();
    h.frame(h.now + 500);
    h.core.showHint(h.fragment.id, 1, 2, h.now);
    h.event("down", 61, h.now + 1);
    h.event("up", 61, h.now + 1);
    h.event("up", h.fragment.melodyPitches[0] ?? 60, h.now + 1);
    h.event("up", h.fragment.bassPitch, h.now + 1);
    h.frame(h.now + 251);
    h.now++;
    h.prepare(0);
    expect(h.core.snapshot().hintLevel).toBe(1);
    h.initial();
    expect(h.core.snapshot().hintLevel).toBe(2);
    h.frame(h.now + 500);
    const previous = h.fragment.melodyPitches[0] ?? 60;
    const pitch = h.fragment.melodyPitches[1] ?? 60;
    h.event("up", previous, h.now);
    h.event("down", pitch, h.now + 1);
    h.frame(h.now + 251);
    expect(h.core.snapshot().hintLevel).toBe(0);
  });
});

describe("held-bass physical and terminal boundaries", () => {
  it.each([-1, 0, 1])(
    "judges bass off end %+i by original time, even delivered after end",
    (delta) => {
      const h = new HeldBassHarness(1, 100);
      h.prepare(0);
      const { rawEnd, lastPitch } = h.reachTerminal();
      h.frame(rawEnd - 100);
      expect(h.core.snapshot().status).toBe("hold");
      h.frame(rawEnd);
      expect(h.core.snapshot().status).toBe("release");
      h.event("up", h.fragment.bassPitch, rawEnd + delta, rawEnd + 100);
      h.event("up", lastPitch, rawEnd + delta, rawEnd + 100);
      h.frame(rawEnd + 251);
      if (delta < 0)
        expect(h.core.snapshot()).toMatchObject({ status: "early-release", answers: [] });
      else if (delta === 0) expect(h.core.snapshot().answers).toHaveLength(1);
      else {
        expect(h.core.snapshot().answers).toHaveLength(0);
        h.frame(rawEnd + 252);
        expect(h.core.snapshot().answers).toHaveLength(1);
      }
    }
  );
  it("requires strict final horizon and no extra fresh attack after last melody", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    const { rawEnd, lastPitch } = h.reachTerminal();
    h.frame(rawEnd);
    h.event("up", lastPitch, rawEnd);
    h.event("up", h.fragment.bassPitch, rawEnd);
    h.frame(rawEnd + 250);
    expect(h.core.snapshot().answers).toHaveLength(0);
    h.frame(rawEnd + 251);
    expect(h.core.snapshot().answers).toHaveLength(1);
    const bad = new HeldBassHarness();
    bad.prepare(0);
    const terminal = bad.reachTerminal();
    bad.event("down", 61, bad.now + 1);
    expect(bad.core.snapshot().status).toBe("third-note");
    bad.frame(terminal.rawEnd);
    expect(bad.core.snapshot().answers).toHaveLength(0);
  });
  it("supports two-note RH legato, rejects a third different held RH", () => {
    const seed = Array.from({ length: 30 }, (_, seed) => seed).find((seed) => {
      const f = generateHeldBassExercise(seed).fragments[0];
      return f?.melodyPitches.length === 4 && new Set(f.melodyPitches.slice(0, 3)).size === 3;
    });
    expect(seed).toBeDefined();
    const h = new HeldBassHarness(seed);
    h.prepare(0);
    h.initial();
    h.frame(h.now + 500);
    h.event("down", h.fragment.melodyPitches[1] ?? 60, h.now + 1);
    h.frame(h.now + 251);
    expect(h.core.snapshot().step).toBe(2);
    h.frame(h.now + 500);
    h.event("down", h.fragment.melodyPitches[2] ?? 60, h.now + 1);
    expect(h.core.snapshot().status).toBe("too-many-melody");
  });
  it("does not count duplicate owners or repeat until last physical up plus fresh down", () => {
    const seed = Array.from({ length: 30 }, (_, seed) => seed).find((seed) => {
      const f = generateHeldBassExercise(seed).fragments[0];
      return f?.melodyPitches[0] === f?.melodyPitches[1];
    });
    expect(seed).toBeDefined();
    const h = new HeldBassHarness(seed);
    h.prepare(0);
    h.initial();
    h.frame(h.now + 500);
    const pitch = h.fragment.melodyPitches[0] ?? 60;
    h.event("down", pitch, h.now + 1, h.now + 1, { ownerId: "second" });
    h.frame(h.now + 251);
    expect(h.core.snapshot().step).toBe(1);
    h.event("up", pitch, h.now + 1);
    h.event("down", pitch, h.now + 1);
    h.frame(h.now + 251);
    expect(h.core.snapshot().step).toBe(1);
    h.event("up", pitch, h.now + 1);
    h.event("up", pitch, h.now + 1, h.now + 1, { ownerId: "second" });
    h.event("down", pitch, h.now + 1);
    h.frame(h.now + 251);
    expect(h.core.snapshot().step).toBe(2);
  });
  it("orders prefix up before a late initial down and never recreates a ghost owner", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    const start = h.now;
    h.event("up", h.fragment.bassPitch, start + 20, start + 30);
    h.event("down", h.fragment.bassPitch, start + 10, start + 40);
    h.frame(start + 271);
    expect(h.core.snapshot()).toMatchObject({
      status: "early-release",
      retryCommand: { fragmentId: h.fragment.id }
    });
    h.now++;
    h.prepare(0);
    expect(h.core.snapshot().presented).toBe(true);
  });
  it("rejects mixed origins and fixed offsets, MIDI channels are one-based", () => {
    const extras: Partial<HeldBassInput>[] = [
      { source: "keyboard" },
      { offsetMs: 1 },
      { channel: 2, deviceId: "second" }
    ];
    for (const extra of extras) {
      const h = new HeldBassHarness(1, 0, "midi");
      h.prepare(0);
      const start = h.now;
      h.event("down", h.fragment.bassPitch, start + 10, start + 10, {
        channel: 1,
        deviceId: "first"
      });
      h.event("down", h.fragment.melodyPitches[0] ?? 60, start + 20, start + 20, {
        channel: 1,
        deviceId: "first",
        ...extra
      });
      expect(h.core.snapshot().status).toBe("mixed-origin");
    }
    const h = new HeldBassHarness(1, 0, "midi");
    h.prepare(0);
    h.event("down", h.fragment.bassPitch, h.now + 1, h.now + 1, { channel: 0 });
    expect(h.core.snapshot().status).toBe("ready");
    h.event("down", h.fragment.bassPitch, h.now + 1, h.now + 1, { channel: 16 });
    h.event("down", h.fragment.melodyPitches[0] ?? 60, h.now + 10, h.now + 10, { channel: 16 });
    h.frame(h.now + 251);
    expect(h.core.snapshot().step).toBe(1);
  });
  it("can register after initial load pause with actual lead-in and exact duplicate anchors", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.core.cancel(h.now);
    h.core.prepare(h.fragment.id, h.now);
    h.core.present(h.fragment.id, h.now);
    h.practice = new PracticeSession(h.fragment.song, {
      mode: "wait",
      speed: 1,
      hands: new Set(["left", "right"]),
      accompaniment: false,
      noteResult: false
    });
    h.practice.startClock(h.now);
    h.practice.pauseClock(h.now);
    expect(
      h.practice.registerVerifiedOnsets({
        runId: "fixture-run",
        presentationId: h.core.snapshot().presentationId ?? "",
        fragmentId: h.fragment.id,
        steps: h.fragment.steps
      })
    ).toBe(true);
    h.practice.resumeClock(h.now + 10);
    h.frame(h.now + 2010);
    h.initial();
    expect(h.core.snapshot().step).toBe(1);
  });
  it("fails whole fragment once after three intermediate notes, retries retain earlier course results and help", () => {
    const h = new HeldBassHarness();
    let index = 0;
    while (h.exercise.fragments[index]?.steps.length !== 4) {
      h.prepare(index);
      h.finish();
      h.now++;
      index++;
    }
    h.prepare(index);
    h.core.showHint(h.fragment.id, 0, 1, h.now);
    h.initial();
    let previous = h.fragment.melodyPitches[0] ?? 60;
    for (let step = 1; step < 3; step++) {
      h.frame(h.now + 500);
      h.event("up", previous, h.now);
      previous = h.fragment.melodyPitches[step] ?? 60;
      h.event("down", previous, h.now + 1);
      h.frame(h.now + 251);
    }
    h.frame(h.now + 500);
    h.event("down", 61, h.now + 1);
    expect(h.core.snapshot().status).toBe("wrong-note");
    h.event("up", 61, h.now + 1);
    h.event("up", previous, h.now + 1);
    h.event("up", h.fragment.bassPitch, h.now + 1);
    h.frame(h.now + 251);
    h.now++;
    h.prepare(index);
    h.finish();
    const answer = h.core.snapshot().answers[index];
    expect(answer).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      hintLevel: 1
    });
    expect(answer?.attempts.map((attempt) => attempt.outcome)).toEqual(["wrong-note", "success"]);
    expect(h.core.snapshot().answers).toHaveLength(index + 1);
    for (let next = index + 1; next < 10; next++) {
      h.now++;
      h.prepare(next);
      h.finish();
    }
    expect(validateHeldBassResult(h.core.result(20000))).not.toBeNull();
  });
});

describe("held-bass bounded strict saved proof", () => {
  it("same physical history and fixed clock commits remain equal at15 and60FPS", () => {
    const run = (fps: number): unknown => {
      const h = new HeldBassHarness();
      h.prepare(0);
      const travel = (until: number): void => {
        for (let at = h.now + 1000 / fps; at < until; at += 1000 / fps) h.frame(at, false);
        h.frame(until, false);
      };
      const start = h.now;
      h.event("down", h.fragment.bassPitch, start + 10);
      h.event("down", h.fragment.melodyPitches[0] ?? 60, start + 50);
      travel(start + 301);
      h.frame(start + 301);
      let pitch = h.fragment.melodyPitches[0] ?? 60;
      for (let step = 1; step < h.fragment.steps.length; step++) {
        const attack = h.now + 500;
        travel(attack);
        h.event("up", pitch, attack);
        pitch = h.fragment.melodyPitches[step] ?? 60;
        h.event("down", pitch, attack + 1);
        travel(attack + 252);
        h.frame(attack + 252);
      }
      const end = h.now + 500;
      travel(end);
      h.event("up", pitch, end);
      h.event("up", h.fragment.bassPitch, end);
      travel(end + 251);
      h.frame(end + 251);
      return h.core.snapshot().answers[0];
    };
    expect(run(15)).toEqual(run(60));
  });
  it("overflows input/clock proof without a score and needs physical release before retry", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.initial();
    const receipt = h.practice.clockReceipt(h.now);
    h.core.tick(h.now, {
      ...receipt,
      segments: Array.from(
        { length: 65 },
        () =>
          receipt.segments[0] ?? { performanceMs: 0, songSeconds: 0, speed: 0, acceptsInput: true }
      )
    });
    expect(h.core.snapshot()).toMatchObject({
      status: "overflow",
      answers: [],
      retryCommand: null
    });
    h.event("up", h.fragment.bassPitch, h.now + 1);
    h.event("up", h.fragment.melodyPitches[0] ?? 60, h.now + 1);
    expect(h.core.snapshot().retryCommand).not.toBeNull();
    const inputs = new HeldBassHarness();
    inputs.prepare(0);
    inputs.initial();
    for (let index = 0; index < 260; index++)
      inputs.event("down", inputs.fragment.bassPitch, inputs.now + 1);
    expect(inputs.core.snapshot().answers).toHaveLength(0);
    expect(inputs.core.snapshot().retryCommand).toBeNull();
    inputs.event("up", inputs.fragment.bassPitch, inputs.now + 1);
    inputs.event("up", inputs.fragment.melodyPitches[0] ?? 60, inputs.now + 1);
    expect(inputs.core.snapshot().retryCommand).not.toBeNull();
  });
  it("ignores future timestamps and stale run/presentation without acquiring held owners", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.event("down", h.fragment.bassPitch, h.now + 100, h.now);
    h.event("down", h.fragment.bassPitch, h.now + 1, h.now + 1, { runId: "old" });
    h.event("down", h.fragment.bassPitch, h.now + 1, h.now + 1, { presentationId: "old" });
    h.initial();
    expect(h.core.snapshot().step).toBe(1);
  });
  it.each([
    "clock jump",
    "speed",
    "missing wait",
    "missing commit",
    "early commit",
    "step ids",
    "raw end",
    "release",
    "help claim",
    "hold claim",
    "runtime",
    "event age",
    "active gate"
  ])("rejects forged %s", (kind) => {
    const result = completeHeldBassFixture();
    const first = result.fragments[0];
    if (!first) throw new Error("No fragment");
    const attempt = first.attempts[0];
    if (!attempt) throw new Error("No attempt");
    const changed = { ...attempt };
    let fragment = { ...first };
    if (kind === "clock jump")
      changed.clock = attempt.clock.map((segment, index) =>
        index === 2 ? { ...segment, songSeconds: 2 } : segment
      );
    if (kind === "speed")
      changed.clock = attempt.clock.map((segment, index) =>
        index === 2 ? { ...segment, speed: 2 } : segment
      );
    if (kind === "missing wait") changed.clock = attempt.clock.filter((_, index) => index !== 1);
    if (kind === "missing commit") changed.onsets = attempt.onsets.slice(1);
    if (kind === "early commit")
      changed.onsets = attempt.onsets.map((onset, index) =>
        index === 0 ? { ...onset, atMs: onset.attackAtMs + 250 } : onset
      );
    if (kind === "step ids")
      changed.onsets = attempt.onsets.map((onset, index) =>
        index === 0 ? { ...onset, noteIds: ["wrong"] } : onset
      );
    if (kind === "raw end") changed.rawEndAtMs = (attempt.rawEndAtMs ?? 0) + 1;
    if (kind === "release") changed.releasedAtMs = attempt.releasedAtMs - 1;
    if (kind === "help claim") fragment = { ...fragment, hintLevel: 1 };
    if (kind === "hold claim") fragment = { ...fragment, heldDurationMs: first.heldDurationMs + 1 };
    if (kind === "runtime") Object.assign(changed, { held: [60] });
    if (kind === "event age")
      changed.events = attempt.events.map((event, index) =>
        index === 0 ? { ...event, receivedAtMs: event.atMs + 251 } : event
      );
    if (kind === "active gate")
      changed.activeIntervals = [{ from: attempt.firstDownAtMs + 1, to: attempt.finalizedAtMs }];
    fragment = { ...fragment, attempts: [changed] };
    expect(
      validateHeldBassResult({ ...result, fragments: [fragment, ...result.fragments.slice(1)] })
    ).toBeNull();
  });
  it("returns detached JSON evidence and filters using successful attempt source retaining errors", () => {
    const result = completeHeldBassFixture();
    const validated = validateHeldBassResult(result);
    expect(validated).toEqual(result);
    expect(validated).not.toBe(result);
    expect(summarizeHeldBassResults([result, result]).fragmentCount).toBe(10);
    expect(validateHeldBassResult({ ...result, pendingCommit: {} })).toBeNull();
  });
  it("source filter retains all MIDI failure/help under the eventual keyboard success", () => {
    const h = new HeldBassHarness();
    h.prepare(0);
    h.core.showHint(h.fragment.id, 0, 1, h.now);
    h.event("down", 61, h.now + 1, h.now + 1, {
      source: "midi",
      channel: 16,
      deviceId: "test-device"
    });
    h.event("up", 61, h.now + 1, h.now + 1, {
      source: "midi",
      channel: 16,
      deviceId: "test-device"
    });
    h.frame(h.now + 251);
    h.now++;
    h.prepare(0);
    h.finish();
    for (let index = 1; index < 10; index++) {
      h.now++;
      h.prepare(index);
      h.finish();
    }
    const result = h.core.result(20000);
    if (!result) throw new Error("Missing course result");
    expect(validateHeldBassResult(result)).toEqual(result);
    expect(summarizeHeldBassResults([result], "keyboard")).toMatchObject({
      fragmentCount: 10,
      errorCount: 1,
      helpedCount: 1,
      independentCount: 9
    });
    expect(summarizeHeldBassResults([result], "midi")).toMatchObject({
      fragmentCount: 0,
      errorCount: 0,
      firstLatencyMs: null
    });
  });
});
