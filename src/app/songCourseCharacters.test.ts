// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { PracticeSession } from "../practice/session";
import type { PracticeEvent } from "../practice/session";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { KeyEvent } from "../input/midiInput";
import { findSongCourseSource } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import { createSongCourseFeedback } from "../staff/songCourseFeedback";
import {
  SongCourseCharacters,
  songCourseCharacterContext,
  type SongCourseCharacterContext
} from "./songCourseCharacters";
import { withSongCourseCharacters } from "./songCourseCharacterPolicy";
import { songCourseOptions } from "./songCourseOptions";

function must<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("missing test fixture");
  return value;
}

function fixture() {
  const source = must(findSongCourseSource("hot-cross-buns"));
  const material = buildSongCourseMaterial(source, "hot-cross-buns/notes-c");
  let context: SongCourseCharacterContext = {
    material,
    phase: "playing",
    presentationId: "p1",
    runId: "r1"
  };
  const feedback = createSongCourseFeedback();
  feedback.reset(material, "p1", "r1");
  const actors = new SongCourseCharacters(() => context, feedback);
  actors.syncContext();
  const session = new PracticeSession(material.song, songCourseOptions(material, 1));
  const first = must(material.expected[0]);
  const second = must(material.expected[1]);
  actors.bind(session);
  const event = (type: "down" | "up", pitch = 60, deviceId = "keyboard"): KeyEvent => ({
    type,
    pitch,
    velocity: 80,
    deviceId
  });
  const times = (raw: number, admitted = true) => ({
    raw,
    corrected: raw,
    received: raw,
    admitted
  });
  const hit = (id = first.runtimeNoteId): readonly PracticeEvent[] => [
    { type: "hit", noteId: id, offset: 0 }
  ];
  const input = (
    type: "down" | "up",
    raw: number,
    events: readonly PracticeEvent[] = [],
    pitch = 60,
    admitted = true
  ) => {
    actors.key(event(type, pitch), session, true, times(raw, admitted), events);
  };
  const update = (
    sourceNoteId: string,
    state: "neutral" | "correct" | "gentle-wrong",
    ordinal: number
  ) => {
    feedback.update(
      {
        presentationId: context.presentationId,
        runId: must(context.runId),
        sourceHash: material.source.sourceHash
      },
      [{ sourceNoteId, state }],
      ordinal
    );
  };
  const patch = (changes: Partial<SongCourseCharacterContext>) => {
    context = { ...context, ...changes };
    actors.syncContext();
  };
  return {
    actors,
    feedback,
    material,
    session,
    first,
    second,
    event,
    times,
    hit,
    input,
    update,
    patch,
    context: () => context
  };
}

describe("course character event source", () => {
  it("illustrates only an accepted physical learner hold then releases to idle", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    expect(h.actors.read()).toMatchObject({
      teacherPose: "do",
      targetSourceNoteId: h.first.sourceNoteId,
      expression: "neutral"
    });
    h.update(h.first.sourceNoteId, "correct", 1);
    h.input("up", 1800);
    expect(h.actors.read()).toMatchObject({
      teacherPose: "idle",
      companion: "do",
      expression: "correct"
    });
  });
  it("keeps the completed feedback until a new canonical attack, even for repeated C", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.update(h.first.sourceNoteId, "correct", 1);
    h.input("up", 1800);
    h.actors.frame(h.session, true);
    expect(h.actors.read().expression).toBe("correct");
    h.input("down", 2000, h.hit(h.second.runtimeNoteId));
    expect(h.actors.read()).toMatchObject({
      targetSourceNoteId: h.second.sourceNoteId,
      companion: "do",
      expression: "neutral",
      teacherPose: "do"
    });
  });
  it("does not publish again or replay a reaction for repeated feedback and unchanged frames", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.update(h.first.sourceNoteId, "correct", 1);
    h.input("up", 1800);
    const before = h.actors.read(),
      listener = vi.fn();
    const stop = h.actors.subscribe(listener);
    h.update(h.first.sourceNoteId, "correct", 2);
    h.input("up", 1801);
    h.actors.frame(h.session, true);
    h.actors.frame(h.session, true);
    expect(h.actors.read()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
  it("shows grader-provided disappointment without a false wrong-key contact", () => {
    const h = fixture();
    h.update(h.first.sourceNoteId, "gentle-wrong", 1);
    h.input("down", 1000, [{ type: "wrong", pitch: 62 }], 62);
    expect(h.actors.read()).toMatchObject({
      teacherPose: "idle",
      companion: "do",
      expression: "gentle-wrong"
    });
  });
  it("ignores unadmitted and mismatched accepted-event claims", () => {
    const h = fixture();
    h.input("down", 1000, h.hit(), 60, false);
    expect(h.actors.read().teacherPose).toBe("idle");
    h.input("down", 1001, h.hit(), 62);
    expect(h.actors.read().teacherPose).toBe("idle");
  });
  it("keeps physical ownership on autorepeat and ignores older raw up/down after a new attack", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.input("down", 1001);
    expect(h.actors.read().teacherPose).toBe("do");
    h.input("up", 1800);
    h.input("down", 2000, h.hit(h.second.runtimeNoteId));
    h.input("up", 1900);
    h.input("down", 1850, h.hit());
    expect(h.actors.read()).toMatchObject({
      teacherPose: "do",
      targetSourceNoteId: h.second.sourceNoteId
    });
    h.input("up", 2100);
    expect(h.actors.read().teacherPose).toBe("idle");
  });
  it("does not confuse two accepted physical notes with a verified single-finger picture", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.actors.key(
      h.event("down", 60, "another-device"),
      h.session,
      true,
      h.times(1001),
      h.hit(h.second.runtimeNoteId)
    );
    expect(h.actors.read().teacherPose).toBe("idle");
  });
  it("rejects old session frames and input after a new session binds", () => {
    const h = fixture();
    const next = new PracticeSession(h.material.song, songCourseOptions(h.material, 1));
    h.actors.bind(next);
    h.input("down", 1000, h.hit());
    h.actors.frame(h.session, true);
    expect(h.actors.read().teacherPose).toBe("idle");
    h.actors.key(h.event("down"), next, true, h.times(1100), h.hit());
    expect(h.actors.read().teacherPose).toBe("do");
  });
  it("clears prior run and presentation state before a new run can bind", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.patch({ presentationId: "p2", runId: "r2" });
    expect(h.actors.read()).toMatchObject({
      presentationId: "p2",
      runId: "r2",
      teacherPose: "idle",
      expression: "neutral"
    });
    h.input("down", 2000, h.hit());
    expect(h.actors.read().teacherPose).toBe("idle");
    h.feedback.reset(h.material, "p2", "r2");
    h.actors.bind(h.session);
    h.input("down", 2100, h.hit());
    expect(h.actors.read().teacherPose).toBe("do");
  });
  it("does not consume feedback from the prior presentation", () => {
    const h = fixture();
    h.patch({ presentationId: "p2", runId: "r2" });
    h.actors.bind(h.session);
    h.feedback.update(
      { presentationId: "p1", runId: "r1", sourceHash: h.material.source.sourceHash },
      [{ sourceNoteId: h.first.sourceNoteId, state: "gentle-wrong" }],
      1
    );
    h.input("down", 1000, []);
    expect(h.actors.read().expression).toBe("neutral");
  });
  it("clears held contacts on pause, visibility, cancel, and disposal", () => {
    const h = fixture();
    h.input("down", 1000, h.hit());
    h.patch({ phase: "paused" });
    expect(h.actors.read().teacherPose).toBe("idle");
    h.patch({ phase: "playing" });
    h.actors.bind(h.session);
    h.input("down", 2000, h.hit());
    h.actors.setVisible(false);
    expect(h.actors.read()).toMatchObject({ visible: false, teacherPose: "idle", companion: null });
    h.actors.setVisible(true);
    expect(h.actors.read().teacherPose).toBe("idle");
    h.input("down", 3000, h.hit());
    h.actors.cancel();
    expect(h.actors.read().teacherPose).toBe("idle");
    h.actors.dispose();
    expect(h.actors.read().presentationId).toBeNull();
  });
  it("follows exact demo song time rather than wall time or accompaniment", () => {
    const h = fixture();
    h.patch({ phase: "demo", runId: null });
    h.actors.bind(h.session);
    h.session.time = h.first.start;
    h.actors.frame(h.session, true);
    expect(h.actors.read().teacherPose).toBe("do");
    h.session.time = h.first.start + h.first.duration;
    h.actors.frame(h.session, false);
    expect(h.actors.read().teacherPose).toBe("idle");
  });
});

describe("character policy observer", () => {
  it("preserves all original calls and event-array identities", () => {
    const h = fixture();
    const events = h.hit(),
      held: readonly KeyEvent[] = [];
    const original: TrainerMusicPolicy = {
      inputCompensationMs: () => 500,
      onStart: vi.fn(() => true),
      onFrame: vi.fn(() => events),
      onInput: vi.fn(() => events),
      seedHeld: vi.fn(),
      cancel: vi.fn(),
      guidance: vi.fn(() => ({
        lights: [],
        frame: { hintNotes: [], due: [], waitingFor: [], hints: true, neutralKeys: false }
      }))
    };
    const policy = withSongCourseCharacters(original, h.actors);
    expect(policy.inputCompensationMs()).toBe(500);
    expect(policy.onStart(h.session, 900, held)).toBe(true);
    expect(policy.onInput(h.event("down"), h.session, true, h.times(1000))).toBe(events);
    expect(h.actors.read().teacherPose).toBe("do");
    expect(policy.onFrame(h.session, true, 1001)).toBe(events);
    policy.cancel(1200, false, "pause");
    expect(original.cancel).toHaveBeenCalledExactlyOnceWith(1200, false, "pause");
    expect(h.actors.read().teacherPose).toBe("idle");
    policy.seedHeld(held, 1300);
    expect(original.seedHeld).toHaveBeenCalledExactlyOnceWith(held, 1300);
    expect(original.onStart).toHaveBeenCalledExactlyOnceWith(h.session, 900, held);
    expect(original.onInput).toHaveBeenCalledExactlyOnceWith(
      h.event("down"),
      h.session,
      true,
      h.times(1000)
    );
    expect(original.onFrame).toHaveBeenCalledExactlyOnceWith(h.session, true, 1001);
  });
});

describe("intro demonstration song identity", () => {
  it("binds the exact filtered demo song and animates its C4 while rejecting a source session and equivalent copy", () => {
    const h = fixture();
    const expectedIds = new Set(h.material.expected.map((note) => note.runtimeNoteId));
    const demoSong = {
      ...h.material.song,
      notes: h.material.song.notes.filter((note) => expectedIds.has(note.id))
    };
    const context = songCourseCharacterContext(
      { material: h.material, phase: "demo" },
      "p1",
      null,
      demoSong
    );
    expect(context.playbackSong).toBe(demoSong);
    h.patch(context);
    h.actors.bind(h.session);
    h.actors.frame(h.session, true);
    expect(h.actors.read().teacherPose).toBe("idle");
    const demoSession = new PracticeSession(demoSong, songCourseOptions(h.material, 1));
    demoSession.time = h.first.start;
    h.actors.bind(demoSession);
    h.actors.frame(demoSession, true);
    expect(h.actors.read().teacherPose).toBe("do");
    const foreign = new PracticeSession({ ...demoSong }, songCourseOptions(h.material, 1));
    foreign.time = h.first.start + h.first.duration + 10;
    const before = h.actors.read();
    h.actors.bind(foreign);
    h.actors.frame(foreign, true);
    expect(h.actors.read()).toBe(before);
    h.actors.frame(demoSession, false);
    expect(h.actors.read().teacherPose).toBe("idle");
  });

  it("invalidates a bound demo when only its playback identity changes and returns safely to the learner song", () => {
    const h = fixture();
    const demoSong = { ...h.material.song, notes: [...h.material.song.notes] };
    h.patch({ phase: "demo", runId: null, playbackSong: demoSong });
    const demoSession = new PracticeSession(demoSong, songCourseOptions(h.material, 1));
    demoSession.time = h.first.start;
    h.actors.bind(demoSession);
    expect(h.actors.read().teacherPose).toBe("do");
    h.patch({ playbackSong: { ...demoSong } });
    expect(h.actors.read().teacherPose).toBe("idle");
    h.actors.frame(demoSession, true);
    expect(h.actors.read().teacherPose).toBe("idle");
    const learner = songCourseCharacterContext(
      { material: h.material, phase: "playing" },
      "p2",
      "r2"
    );
    expect(learner.playbackSong).toBe(h.material.song);
    h.patch(learner);
    h.feedback.reset(h.material, "p2", "r2");
    h.actors.bind(h.session);
    h.input("down", 2000, h.hit());
    expect(h.actors.read().teacherPose).toBe("do");
    h.actors.frame(demoSession, false);
    expect(h.actors.read().teacherPose).toBe("do");
  });
});

describe("accepted-note hold cue observer", () => {
  it("follows only the bound music clock and never publishes numeric frames to React", () => {
    const h = fixture();
    h.session.time = 0;
    h.input("down", 1000, h.hit());
    expect(h.actors.readHold()).toMatchObject({
      sourceNoteId: h.first.sourceNoteId,
      progress: 0,
      action: "hold"
    });
    const changed = vi.fn();
    h.actors.subscribe(changed);
    h.session.time = h.first.duration / 2;
    h.actors.frame(h.session, true);
    expect(h.actors.readHold()?.progress).toBeCloseTo(0.5);
    h.session.time = h.first.duration;
    h.actors.frame(h.session, true);
    expect(h.actors.readHold()?.action).toBe("release");
    expect(changed).not.toHaveBeenCalled();
    h.input("up", 1800);
    expect(h.actors.readHold()).toBeNull();
  });
  it("never starts from wrong keys, unadmitted claims, demo, seeding or a stale run", () => {
    const h = fixture();
    h.session.time = 0;
    h.input("down", 1000, [{ type: "wrong", pitch: 62 }], 62);
    expect(h.actors.readHold()).toBeNull();
    h.input("down", 1100, h.hit(), 60, false);
    expect(h.actors.readHold()).toBeNull();
    h.patch({ phase: "demo" });
    h.input("down", 1200, h.hit());
    expect(h.actors.readHold()).toBeNull();
    h.patch({ phase: "playing", runId: "r2" });
    h.actors.bind(h.session);
    h.input("down", 1300, h.hit());
    expect(h.actors.readHold()).not.toBeNull();
    h.patch({ runId: "r3" });
    expect(h.actors.readHold()).toBeNull();
    h.actors.bind(h.session);
    h.input("down", 1400, h.hit());
    h.actors.cancel();
    expect(h.actors.readHold()).toBeNull();
  });
  it("preserves a paused cue across blocked start and resumes only a confirmed owner rehold", () => {
    const h = fixture();
    h.session.time = 0;
    h.input("down", 1000, h.hit());
    h.session.time = h.first.duration * 0.4;
    h.patch({ phase: "paused" });
    const base = {
      inputCompensationMs: () => 0,
      onStart: () => false,
      onFrame: () => [],
      onInput: (event: KeyEvent) => {
        if (event.type === "down" && event.pitch === 60 && h.context().phase === "awaiting-rehold")
          h.patch({ phase: "playing" });
        return [];
      },
      seedHeld: () => undefined,
      cancel: () => undefined,
      guidance: () => ({})
    } as unknown as TrainerMusicPolicy;
    const policy = withSongCourseCharacters(base, h.actors);
    policy.cancel(1200, false, "pause");
    h.session.time = 50;
    expect(h.actors.readHold()).toMatchObject({ paused: true, progress: 0.4 });
    expect(policy.onStart(h.session, 1250, [])).toBe(false);
    expect(h.actors.readHold()?.progress).toBeCloseTo(0.4);
    h.actors.key(h.event("up"), h.session, false, h.times(1300), [], "paused");
    h.patch({ phase: "awaiting-rehold" });
    policy.onInput(h.event("down", 62), h.session, false, h.times(1350));
    expect(h.actors.readHold()?.paused).toBe(true);
    policy.onInput(h.event("down"), h.session, false, h.times(1400));
    expect(h.actors.readHold()).toMatchObject({ paused: false, progress: 0.4 });
    h.session.time += h.first.duration * 0.6;
    expect(h.actors.readHold()?.action).toBe("release");
    h.actors.key(h.event("up"), h.session, true, h.times(1800), []);
    expect(h.actors.readHold()).toBeNull();
  });
  it("clears on early release, hiding, failed cleanup and source replacement", () => {
    for (const ending of ["release", "hidden", "cancel", "source"] as const) {
      const h = fixture();
      h.session.time = 0;
      h.input("down", 1000, h.hit());
      if (ending === "release") h.input("up", 1100);
      if (ending === "hidden") h.actors.setVisible(false);
      if (ending === "cancel") h.actors.cancel();
      if (ending === "source") h.patch({ material: { ...h.material } });
      expect(h.actors.readHold(), ending).toBeNull();
    }
  });
});
