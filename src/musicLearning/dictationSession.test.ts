// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateDictation } from "./dictation";
import {
  createDictationListening,
  reduceDictationListening,
  restartDictationListening,
  summarizeDictationListening
} from "./dictationListening";
import type { DictationListeningEvent } from "./dictationListening";
import { DictationSession } from "./dictationSession";
import type { DictationInput } from "./dictationSession";
import type { MusicPurpose } from "./types";

const exercise = generateDictation({
  seed: 4,
  length: 3,
  studiedPitches: [60],
  studiedDurations: [1],
  startMode: "known",
  bpm: 120
});
function controller(purpose: MusicPurpose = "control"): DictationSession {
  return new DictationSession({
    exercise,
    purpose,
    attemptId: "attempt-1",
    presentationId: "presentation-1",
    input: { source: "midi", deviceId: "piano", channel: 1 }
  });
}
function listening(
  kind: DictationListeningEvent["kind"],
  playbackId = "play-1",
  atMs = 1
): DictationListeningEvent {
  return { kind, playbackId, atMs, presentationId: "presentation-1" };
}
function readyReply(session: DictationSession): void {
  session.setReady(true);
  session.receiveListening(listening("request"));
  session.receiveListening(listening("first-sound", "play-1", 2));
  session.receiveListening(listening("complete", "play-1", 3));
  expect(session.openReply()).toBe(true);
}
function input(
  kind: "up" | "down",
  songBeat: number,
  overrides: Partial<DictationInput> = {}
): DictationInput {
  return {
    kind,
    songBeat,
    correctedAtMs: 100 + songBeat * 500,
    pitch: 60,
    source: "midi",
    deviceId: "piano",
    channel: 1,
    presentationId: "presentation-1",
    ...overrides
  };
}

describe("dictation physical reply lifecycle", () => {
  it("requires readiness, one full reference, and release of preheld keys", () => {
    const session = controller();
    expect(session.openReply()).toBe(false);
    expect(session.receiveInput(input("down", 0))).toBe(false);
    session.receiveListening(listening("request"));
    session.receiveListening(listening("first-sound"));
    session.receiveListening(listening("complete"));
    expect(session.openReply()).toBe(false);
    session.setReady(true);
    expect(session.openReply()).toBe(false);
    session.receiveInput(input("up", 0.5));
    expect(session.openReply()).toBe(true);
    expect(session.snapshot().notes).toEqual([]);
  });
  it("deduplicates down without up and records duration from physical release", () => {
    const session = controller();
    readyReply(session);
    expect(session.receiveInput(input("down", 10))).toBe(true);
    expect(session.receiveInput(input("down", 10.2))).toBe(false);
    expect(session.finish()).toBeNull();
    expect(session.receiveInput(input("up", 11))).toBe(true);
    const result = session.finish();
    expect(result?.notes).toHaveLength(1);
    expect(result?.notes[0]).toMatchObject({
      startBeat: 10,
      durationBeats: 1,
      downAtMs: 5100,
      upAtMs: 5600,
      origin: { source: "midi", deviceId: "piano", channel: 1 }
    });
    expect(result?.comparison.missingNotes).toBe(2);
    expect(result?.comparison.holdingDurations.accuracy).toBe(1);
  });
  it("never auto-finishes at N notes and preserves excess notes", () => {
    const session = controller();
    readyReply(session);
    for (let index = 0; index < 4; index++) {
      session.receiveInput(input("down", index));
      session.receiveInput(input("up", index + 1));
      expect(session.snapshot().status).toBe("reply");
    }
    expect(session.finish()?.comparison.extraNotes).toBe(1);
  });
  it("finishes an empty reply with null accuracy and no result on second finish", () => {
    const session = controller();
    readyReply(session);
    expect(session.finish()?.comparison).toMatchObject({ status: "not-performed", correct: null });
    expect(session.finish()).toBeNull();
  });
  it("rejects stale presentations, wrong sources, devices and channels", () => {
    const session = controller();
    readyReply(session);
    for (const override of [
      { presentationId: "old" },
      { source: "keyboard" as const },
      { deviceId: "other" },
      { channel: 2 }
    ])
      expect(session.receiveInput(input("down", 1, override))).toBe(false);
    expect(session.snapshot().heldCount).toBe(0);
    expect(session.snapshot().notes).toHaveLength(0);
  });
  it("tracks pause/not-ready holds and requires release before another attack", () => {
    const session = controller();
    readyReply(session);
    session.setPaused(true);
    expect(session.receiveInput(input("down", 1))).toBe(false);
    expect(session.finish()).toBeNull();
    session.setPaused(false);
    expect(session.receiveInput(input("down", 2))).toBe(false);
    session.receiveInput(input("up", 2.5));
    session.setReady(false);
    expect(session.receiveInput(input("down", 3))).toBe(false);
    session.setReady(true);
    expect(session.receiveInput(input("down", 3.5))).toBe(false);
    session.receiveInput(input("up", 4));
    expect(session.receiveInput(input("down", 5))).toBe(true);
    session.receiveInput(input("up", 6));
    expect(session.finish()?.notes).toHaveLength(1);
  });
  it("rejects delayed pre-opening and pre-resume attacks using the corrected-time boundary", () => {
    const session = controller();
    readyReply(session);
    session.setPaused(true, 1000);
    session.setPaused(false, 2000);
    expect(session.receiveInput(input("down", 1))).toBe(false);
    session.receiveInput(input("up", 2));
    expect(session.receiveInput(input("down", 5))).toBe(true);
    session.receiveInput(input("up", 6));
    expect(session.finish()?.notes).toHaveLength(1);
  });
  it("anchors rhythm to the wrong first physical attack and keeps every later attack", () => {
    const session = controller();
    readyReply(session);
    session.receiveInput(input("down", 10, { pitch: 59 }));
    session.receiveInput(input("up", 11, { pitch: 59 }));
    for (const beat of [11, 12]) {
      session.receiveInput(input("down", beat));
      session.receiveInput(input("up", beat + 1));
    }
    expect(session.finish()?.comparison).toMatchObject({
      pitchMismatchIndices: [0],
      alignedOnsets: { errorsBeats: [0, 0, 0] },
      onsetIntervals: { accuracy: 1 }
    });
  });
  it("ignores reordered down/up evidence and keeps the actual held duration", () => {
    const session = controller();
    readyReply(session);
    session.receiveInput(input("down", 1));
    expect(session.receiveInput(input("up", 0.5))).toBe(false);
    expect(session.finish()).toBeNull();
    session.receiveInput(input("up", 2));
    expect(session.receiveInput(input("down", 1.5))).toBe(false);
    expect(session.finish()?.notes[0]?.durationBeats).toBe(1);
  });
  it("does not let an up from another physical owner end a note", () => {
    const session = controller();
    readyReply(session);
    session.receiveInput(input("down", 1, { ownerId: "owner-a" }));
    expect(session.receiveInput(input("up", 2, { ownerId: "owner-b" }))).toBe(false);
    expect(session.finish()).toBeNull();
    session.receiveInput(input("up", 2, { ownerId: "owner-a" }));
    expect(session.finish()?.notes).toHaveLength(1);
  });
  it("cancels evidence and rejects every later event/callback", () => {
    const session = controller();
    session.receiveListening(listening("request"));
    session.receiveListening(listening("first-sound"));
    session.cancel(4);
    expect(summarizeDictationListening(session.snapshot().listening).partial).toBe(1);
    expect(session.receiveListening(listening("complete"))).toBe(false);
    expect(session.receiveInput(input("down", 1))).toBe(false);
    expect(session.openReply()).toBe(false);
    expect(session.finish()).toBeNull();
  });
  it("allows a replay after reply opens, gating physical input during its sound", () => {
    const session = controller("training");
    readyReply(session);
    expect(session.receiveListening(listening("request", "replay", 4))).toBe(true);
    expect(session.receiveInput(input("down", 1))).toBe(false);
    session.receiveInput(input("up", 2));
    expect(session.finish()).toBeNull();
    session.receiveListening(listening("first-sound", "replay", 5));
    session.receiveListening(listening("complete", "replay", 6));
    expect(session.receiveInput(input("down", 3))).toBe(true);
    expect(session.receiveListening(listening("request", "held-replay", 7))).toBe(false);
    session.receiveInput(input("up", 4));
    expect(session.finish()?.notes).toHaveLength(1);
  });
  it("records training assistance and refuses assistance in control", () => {
    expect(controller().addHelp({ kind: "explanation", atMs: 1 })).toBe(false);
    const session = controller("training");
    expect(session.addHelp({ kind: "explanation", atMs: 1 })).toBe(true);
    readyReply(session);
    expect(session.finish()?.help).toEqual([{ kind: "explanation", atMs: 1 }]);
  });
});

describe("dictation listening receipts", () => {
  it("spends quota only on actual first sound and separates partial/full", () => {
    let state = createDictationListening("attempt-1", "presentation-1", "control");
    state = reduceDictationListening(state, listening("request"));
    expect(summarizeDictationListening(state).started).toBe(0);
    state = reduceDictationListening(state, listening("interrupt"));
    expect(summarizeDictationListening(state)).toMatchObject({
      started: 0,
      partial: 0,
      canListen: true
    });
    state = reduceDictationListening(state, listening("request", "play-2"));
    state = reduceDictationListening(state, listening("first-sound", "play-2"));
    expect(summarizeDictationListening(state).started).toBe(1);
    state = reduceDictationListening(state, listening("interrupt", "play-2"));
    expect(summarizeDictationListening(state)).toMatchObject({
      full: 0,
      partial: 1,
      canReply: false
    });
    state = reduceDictationListening(state, listening("request", "play-3"));
    state = reduceDictationListening(state, listening("first-sound", "play-3"));
    state = reduceDictationListening(state, listening("complete", "play-3"));
    expect(summarizeDictationListening(state)).toMatchObject({
      started: 2,
      full: 1,
      partial: 1,
      canListen: false,
      canReply: true,
      retryRequired: false
    });
    expect(reduceDictationListening(state, listening("request", "play-4"))).toBe(state);
  });
  it("requires explicit new IDs after two interrupted plays; replay never resets quota", () => {
    let state = createDictationListening("attempt-1", "presentation-1", "control");
    for (const playbackId of ["play-1", "play-2"]) {
      state = reduceDictationListening(state, listening("request", playbackId));
      state = reduceDictationListening(state, listening("first-sound", playbackId));
      state = reduceDictationListening(state, listening("interrupt", playbackId));
    }
    expect(summarizeDictationListening(state)).toMatchObject({
      retryRequired: true,
      canReply: false
    });
    expect(reduceDictationListening(state, listening("request", "play-3"))).toBe(state);
    expect(() => restartDictationListening(state, "attempt-1", "presentation-2")).toThrow();
    expect(() => restartDictationListening(state, "attempt-2", "presentation-1")).toThrow();
    expect(
      summarizeDictationListening(restartDictationListening(state, "attempt-2", "presentation-2"))
        .started
    ).toBe(0);
  });
  it("allows unlimited training listening", () => {
    let state = createDictationListening("attempt-1", "presentation-1", "training");
    for (let index = 0; index < 5; index++) {
      const playbackId = `play-${String(index)}`;
      state = reduceDictationListening(state, listening("request", playbackId));
      state = reduceDictationListening(state, listening("first-sound", playbackId));
      state = reduceDictationListening(state, listening("complete", playbackId));
    }
    expect(summarizeDictationListening(state)).toMatchObject({
      started: 5,
      full: 5,
      canListen: true
    });
  });
  it("ignores stale callbacks, callbacks before sound and duplicate receipts", () => {
    let state = createDictationListening("attempt-1", "presentation-1", "control");
    state = reduceDictationListening(state, listening("request"));
    expect(reduceDictationListening(state, listening("complete"))).toBe(state);
    expect(
      reduceDictationListening(state, { ...listening("first-sound"), presentationId: "old" })
    ).toBe(state);
    expect(reduceDictationListening(state, listening("first-sound", "unknown"))).toBe(state);
    state = reduceDictationListening(state, listening("first-sound"));
    expect(reduceDictationListening(state, listening("first-sound"))).toBe(state);
    state = reduceDictationListening(state, listening("complete"));
    expect(reduceDictationListening(state, listening("interrupt"))).toBe(state);
    expect(reduceDictationListening(state, listening("request"))).toBe(state);
    expect(summarizeDictationListening(state)).toMatchObject({ started: 1, full: 1, partial: 0 });
  });
});

describe("dictation allocation-free counters and listening state", () => {
  it("tracks admitted attack count through releases and cancellation without accepting duplicates", () => {
    const session = controller();
    expect(session.noteCount).toBe(0);
    session.receiveInput(input("down", 0));
    expect(session.noteCount).toBe(0);
    session.receiveInput(input("up", 0));
    readyReply(session);
    session.receiveInput(input("down", 1));
    expect(session.noteCount).toBe(1);
    session.receiveInput(input("down", 1.1));
    expect(session.noteCount).toBe(1);
    session.receiveInput(input("up", 2));
    expect(session.noteCount).toBe(1);
    session.cancel(2000);
    session.receiveInput(input("down", 4));
    expect(session.noteCount).toBe(1);
  });
  it("exposes the current immutable listening value without cloning captured notes", () => {
    const session = controller();
    const initial = session.listeningState();
    expect(session.listeningState()).toBe(initial);
    session.receiveListening(listening("request"));
    const requested = session.listeningState();
    expect(requested).not.toBe(initial);
    expect(initial.receipts).toHaveLength(0);
    expect(requested.receipts).toHaveLength(1);
    expect(session.listeningState()).toBe(requested);
    session.cancel(2);
    expect(session.listeningState().receipts[0]?.outcome).toBe("failed-before-start");
  });
});
