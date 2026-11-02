import { describe, expect, it } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import { HarmonyChordInput } from "./harmonyInput";
import type { HarmonyInputOptions } from "./harmonyInput";
import type { HarmonyTarget } from "./harmony";

const target: HarmonyTarget = { mode: "exact", pitches: [60, 64, 67] };
const origin = { source: "midi" as const, deviceId: "piano", channel: 1 };
function setup(options: HarmonyInputOptions = {}, present = true) {
  const input = new HarmonyChordInput(options);
  if (present) input.present({ id: "one", atMs: 100, correctedAtMs: 100, target });
  const event = (
    type: "down" | "up",
    pitch: number,
    atMs: number,
    receivedAtMs = atMs,
    correctedAtMs = atMs,
    changes: Partial<KeyEvent> = {}
  ) =>
    input.input(
      { type, pitch, velocity: 80, timestamp: atMs, ...origin, ...changes },
      { receivedAtMs, correctedAtMs }
    );
  return { input, event };
}
const chord = (h: ReturnType<typeof setup>, at = 200) => {
  h.event("down", 60, at);
  h.event("down", 64, at + 100);
  return h.event("down", 67, at + 200);
};

describe("physical harmony input", () => {
  const fastChord = (h: ReturnType<typeof setup>) => {
    h.event("down", 60, 200);
    h.event("down", 64, 210);
    return h.event("down", 67, 220);
  };
  it("keeps fast chords provisional through the whole attack window and delivery grace", () => {
    const h = setup();
    expect(fastChord(h).status).toBe("pending");
    expect(h.input.advance(471).status).toBe("pending");
    expect(h.input.advance(650).status).toBe("pending");
    expect(h.input.advance(651)).toMatchObject({
      status: "accepted",
      completedAtMs: 220,
      spreadMs: 20
    });
  });
  it.each([
    { pitch: 65, changes: {}, reason: "extra-note" },
    { pitch: 72, changes: {}, reason: "octave-duplicate" },
    { pitch: 65, changes: { deviceId: "other" }, reason: "mixed-origin" },
    { pitch: 65, changes: { channel: 2 }, reason: "mixed-origin" },
    { pitch: 65, changes: { source: "keyboard" as const }, reason: "mixed-origin" }
  ])(
    "revokes a provisional chord for $reason after its third note",
    ({ pitch, changes, reason }) => {
      const h = setup();
      fastChord(h);
      expect(h.event("down", pitch, 230, 230, 230, changes)).toMatchObject({
        status: "release",
        reason,
        acceptedPitches: [],
        completedAtMs: null,
        spreadMs: null
      });
      expect(h.input.advance(1000).status).toBe("release");
      h.event("up", 60, 1100);
      h.event("up", 64, 1110);
      h.event("up", 67, 1120);
      expect(h.event("up", pitch, 1130, 1130, 1130, changes).status).toBe("ready");
    }
  );
  it("includes the final attack-window boundary even when the fourth note is delivered late", () => {
    const h = setup();
    fastChord(h);
    expect(h.input.advance(500).status).toBe("pending");
    expect(h.event("down", 65, 400, 650)).toMatchObject({
      status: "release",
      reason: "extra-note",
      acceptedPitches: []
    });
  });
  it("allows an explicitly admitted octave double in class recognition within the same window", () => {
    const h = setup({}, false);
    h.input.present({
      id: "classes",
      atMs: 100,
      correctedAtMs: 100,
      target: { mode: "pitch-class", pitches: [60, 64, 67] }
    });
    fastChord(h);
    expect(h.event("down", 72, 230)).toMatchObject({
      status: "pending",
      acceptedPitches: [60, 64, 67, 72],
      spreadMs: 30
    });
    expect(h.input.advance(651).status).toBe("accepted");
  });
  it("revokes a provisional chord on release inside its attack window", () => {
    const h = setup();
    fastChord(h);
    expect(h.event("up", 60, 230)).toMatchObject({
      status: "release",
      reason: "early-release",
      acceptedPitches: []
    });
    expect(h.input.advance(651).status).toBe("release");
  });
  it("preserves a completed chord when later events fall outside its attack window", () => {
    const h = setup();
    fastChord(h);
    expect(h.event("down", 65, 401)).toMatchObject({
      status: "pending",
      acceptedPitches: [60, 64, 67],
      held: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }, { pitch: 65 }]
    });
    h.event("up", 60, 410);
    expect(h.input.advance(651)).toMatchObject({
      status: "accepted",
      acceptedPitches: [60, 64, 67],
      reason: null
    });
    h.input.present({
      id: "next",
      atMs: 700,
      correctedAtMs: 700,
      target,
      retainCommonPitches: [64, 67]
    });
    expect(h.input.snapshot()).toMatchObject({
      status: "blocked",
      held: [{ pitch: 64 }, { pitch: 67 }, { pitch: 65 }]
    });
  });
  it("keeps timeout history at a deterministic policy deadline through release and retry", () => {
    const h = setup();
    h.event("down", 60, 200);
    const expected = [{ reason: "too-slow", firstAtMs: 200, failedAtMs: 650 }];
    expect(h.input.advance(1000)).toMatchObject({
      status: "release",
      reason: "too-slow",
      attempts: expected
    });
    expect(h.event("up", 60, 1100)).toMatchObject({ status: "ready", attempts: expected });
    chord(h, 1200);
    expect(h.input.advance(1651)).toMatchObject({ status: "accepted", attempts: expected });
    const noFrames = setup();
    noFrames.event("down", 60, 200);
    expect(noFrames.event("up", 60, 1100)).toMatchObject({ status: "ready", attempts: expected });
  });
  it("accepts inclusive 200ms after the existing 250ms delivery horizon, rejecting 201ms", () => {
    const h = setup();
    expect(chord(h)).toMatchObject({ status: "pending", spreadMs: 200 });
    expect(h.input.advance(650).status).toBe("pending");
    expect(h.input.advance(651)).toMatchObject({
      status: "accepted",
      acceptedPitches: [60, 64, 67]
    });
    const slow = setup();
    slow.event("down", 60, 200);
    slow.event("down", 64, 300);
    expect(slow.event("down", 67, 401)).toMatchObject({ status: "release", reason: "too-slow" });
  });
  it("measures corrected attack times and not event delivery times", () => {
    const h = setup();
    h.event("down", 60, 200, 400, 150);
    h.event("down", 64, 300, 450, 250);
    expect(h.event("down", 67, 400, 600, 350)).toMatchObject({
      status: "pending",
      spreadMs: 200,
      completedAtMs: 350
    });
    expect(h.input.advance(651).status).toBe("accepted");
    const correctedSlow = setup();
    correctedSlow.event("down", 60, 200, 200, 150);
    correctedSlow.event("down", 64, 300, 300, 250);
    expect(correctedSlow.event("down", 67, 400, 400, 351).reason).toBe("too-slow");
  });
  it("replays out-of-order attacks within the delivery policy", () => {
    const h = setup();
    h.event("down", 64, 300, 320);
    h.event("down", 60, 200, 400);
    h.event("down", 67, 400, 401);
    expect(h.input.advance(651)).toMatchObject({ status: "accepted", spreadMs: 200 });
  });
  it("retracts a provisional chord when a late up physically preceded its last down", () => {
    const h = setup();
    chord(h);
    expect(h.event("up", 60, 350, 500)).toMatchObject({
      status: "release",
      reason: "early-release",
      acceptedPitches: []
    });
    expect(h.input.advance(1000).status).toBe("release");
  });
  it("rejects preheld notes and duplicate downs until a full physical release", () => {
    const h = setup({}, false);
    h.event("down", 60, 50);
    h.input.present({ id: "one", atMs: 100, correctedAtMs: 100, target });
    expect(chord(h).status).toBe("blocked");
    h.event("up", 60, 450);
    h.event("up", 64, 460);
    expect(h.event("up", 67, 470).status).toBe("ready");
    chord(h, 500);
    expect(h.input.advance(951).status).toBe("accepted");
  });
  it("does not count repeated down as a new attack or an extra attempt", () => {
    const h = setup();
    h.event("down", 60, 200);
    h.event("down", 60, 250);
    h.event("down", 64, 300);
    h.event("down", 67, 400);
    expect(h.input.advance(651)).toMatchObject({ status: "accepted", spreadMs: 200, attempts: [] });
  });
  it("requires releasing every participating key after an error before retry", () => {
    const h = setup();
    expect(h.event("down", 61, 200).reason).toBe("extra-note");
    h.event("down", 60, 210);
    h.event("up", 61, 220);
    h.event("down", 64, 230);
    expect(h.event("down", 67, 240).status).toBe("release");
    h.event("up", 60, 250);
    h.event("up", 64, 260);
    h.event("up", 67, 270);
    expect(h.input.snapshot()).toMatchObject({
      status: "ready",
      attempts: [{ reason: "extra-note" }]
    });
    chord(h, 300);
    expect(h.input.advance(751).status).toBe("accepted");
  });
  it("ignores foreign device releases and rejects mixed device/source/channel attacks", () => {
    for (const changes of [
      { deviceId: "other" },
      { channel: 2 },
      { source: "keyboard" as const }
    ]) {
      const h = setup();
      h.event("down", 60, 200);
      expect(h.event("up", 60, 210, 210, 210, changes).held).toHaveLength(1);
      expect(h.event("down", 64, 300, 300, 300, changes).reason).toBe("mixed-origin");
    }
    const filtered = setup({ origin });
    filtered.event("down", 61, 200, 200, 200, { deviceId: "foreign" });
    expect(filtered.input.snapshot()).toMatchObject({ status: "ready", held: [] });
    chord(filtered, 300);
    expect(filtered.input.advance(751).status).toBe("accepted");
  });
  it("sequential notes and sustain cannot accumulate a physically held chord", () => {
    const h = setup();
    h.input.input({ type: "pedal", down: true, timestamp: 150, ...origin } as unknown as KeyEvent, {
      correctedAtMs: 150,
      receivedAtMs: 150
    });
    for (const [index, pitch] of [60, 64, 67].entries()) {
      h.event("down", pitch, 200 + index * 50);
      h.event("up", pitch, 220 + index * 50);
    }
    expect(h.input.advance(1000)).toMatchObject({
      status: "ready",
      acceptedPitches: [],
      attempts: [
        { reason: "early-release" },
        { reason: "early-release" },
        { reason: "early-release" }
      ]
    });
  });
  it("carries only continuously held admitted common keys from the immediately accepted chord", () => {
    const h = setup();
    chord(h);
    h.input.advance(651);
    h.input.present({
      id: "two",
      atMs: 700,
      correctedAtMs: 700,
      target: { mode: "exact", pitches: [60, 65, 69] },
      retainCommonPitches: [60]
    });
    h.event("up", 64, 710);
    h.event("up", 67, 720);
    expect(h.event("down", 65, 750).status).toBe("collecting");
    expect(h.event("down", 69, 950).status).toBe("pending");
    expect(h.input.advance(1201)).toMatchObject({
      status: "accepted",
      commonPitches: [60],
      spreadMs: 200
    });
  });
  it("revokes held carry after a release/re-attack and rejects unproven first-presentation carry", () => {
    const h = setup({}, false);
    h.event("down", 60, 50);
    h.input.present({
      id: "first",
      atMs: 100,
      correctedAtMs: 100,
      target,
      retainCommonPitches: [60]
    });
    expect(chord(h).status).toBe("blocked");
    const next = setup();
    chord(next);
    next.input.advance(651);
    next.event("up", 60, 660);
    next.event("down", 60, 670);
    next.input.present({
      id: "next",
      atMs: 700,
      correctedAtMs: 700,
      target,
      retainCommonPitches: [60, 64, 67]
    });
    expect(next.input.snapshot().status).toBe("blocked");
  });
  it("does not transfer carry through an unaccepted intermediate presentation", () => {
    const h = setup();
    chord(h);
    h.input.advance(651);
    h.input.present({
      id: "two",
      atMs: 700,
      correctedAtMs: 700,
      target,
      retainCommonPitches: [60, 64, 67]
    });
    h.input.present({
      id: "three",
      atMs: 710,
      correctedAtMs: 710,
      target,
      retainCommonPitches: [60, 64, 67]
    });
    expect(h.input.snapshot().status).toBe("blocked");
  });
  it("requires the new voices of a held-common transition to fit the same 200ms window", () => {
    const h = setup();
    chord(h);
    h.input.advance(651);
    h.input.present({
      id: "two",
      atMs: 700,
      correctedAtMs: 700,
      target: { mode: "exact", pitches: [60, 65, 69] },
      retainCommonPitches: [60]
    });
    h.event("up", 64, 710);
    h.event("up", 67, 720);
    h.event("down", 65, 750);
    expect(h.event("down", 69, 951)).toMatchObject({ status: "release", reason: "too-slow" });
  });
  it("does not mistake equal timestamps after a release/re-attack for continuous carry", () => {
    const h = setup();
    h.event("down", 60, 200);
    h.event("down", 64, 200);
    h.event("down", 67, 200);
    h.event("up", 60, 200);
    h.event("down", 60, 200);
    h.input.advance(451);
    h.input.present({
      id: "two",
      atMs: 500,
      correctedAtMs: 500,
      target,
      retainCommonPitches: [60, 64, 67]
    });
    expect(h.input.snapshot().status).toBe("blocked");
  });
  it("blocks a key physically attacked before presentation even when delivered after presentation", () => {
    const h = setup();
    expect(h.event("down", 60, 90, 200, 90).status).toBe("blocked");
    expect(h.event("down", 64, 210).status).toBe("blocked");
  });
  it("accepts delivery at 250ms but a stale release cancels evidence without creating success", () => {
    const h = setup();
    h.event("down", 60, 200, 450);
    h.event("down", 64, 300, 500);
    h.event("down", 67, 400, 650);
    expect(h.input.advance(651).status).toBe("accepted");
    expect(h.event("up", 60, 660, 911)).toMatchObject({ status: "blocked", acceptedPitches: [] });
  });
  it("seeds handoff owners as unproven preheld keys and never as accepted chord evidence", () => {
    const h = setup({}, false);
    h.input.seedHeld([
      { ...origin, pitch: 60, atMs: 50, correctedAtMs: 50 },
      { ...origin, pitch: NaN, atMs: 50, correctedAtMs: 50 }
    ]);
    h.input.present({
      id: "seed",
      atMs: 100,
      correctedAtMs: 100,
      target,
      retainCommonPitches: [60]
    });
    expect(h.input.snapshot()).toMatchObject({
      status: "blocked",
      held: [{ pitch: 60 }],
      acceptedPitches: []
    });
  });
  it("ignores invalid timestamps, future and expired delivery, malformed origin and stale IDs", () => {
    const h = setup();
    for (const atMs of [NaN, Infinity, -1, Number.MAX_VALUE]) h.event("down", 60, atMs, 200, 200);
    for (const changes of [
      { pitch: 128 },
      { pitch: 60.5 },
      { channel: 17 },
      { channel: 0 },
      { deviceId: "" },
      { source: "unknown" as "midi" },
      { velocity: NaN }
    ])
      h.event("down", 60, 200, 200, 200, changes);
    h.event("down", 60, 201, 200);
    h.event("down", 60, 200, 451);
    h.input.input(
      { type: "down", pitch: 60, velocity: 80, timestamp: 460, ...origin },
      { correctedAtMs: 460, receivedAtMs: 460, presentationId: "old" }
    );
    h.input.input(
      { type: "down", pitch: 60, velocity: 80, timestamp: 460, ...origin },
      { correctedAtMs: NaN, receivedAtMs: 460 }
    );
    expect(h.input.snapshot()).toMatchObject({ status: "ready", held: [], attempts: [] });
  });
  it("uses the configured shared receipt grace and caller frame time for timeout", () => {
    const h = setup({ deliveryGraceMs: 100 });
    h.event("down", 60, 200);
    expect(h.input.advance(500).status).toBe("collecting");
    expect(h.input.advance(501)).toMatchObject({ status: "release", reason: "too-slow" });
    expect(() => new HarmonyChordInput({ deliveryGraceMs: NaN })).toThrow(RangeError);
    expect(() => h.input.present({ id: "bad", atMs: 0, correctedAtMs: 0, target })).toThrow(
      RangeError
    );
  });
  it("cancels evidence on reset and permits keyboard/pointer operation without MIDI", () => {
    for (const source of ["keyboard", "pointer"] as const) {
      const h = setup();
      for (const [index, pitch] of [60, 64, 67].entries())
        h.event("down", pitch, 200 + index * 100, 200 + index * 100, 200 + index * 100, { source });
      expect(h.input.advance(651).status).toBe("accepted");
      h.input.reset();
      expect(h.input.snapshot()).toMatchObject({
        status: "unpresented",
        held: [],
        acceptedPitches: []
      });
    }
  });
});
