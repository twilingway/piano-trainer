// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { readingActions } from "./readingSlice";
import { useReadingCourse, useReadingTrainer } from "./useReadingCourse";
import * as adaptation from "../reading/adaptation";
import { createMemoryReadingRepository } from "./readingRepository";
import { generateReadingExercise } from "../reading/generator";
import { initialReadingState } from "./readingSlice";
import { trainerGuidance } from "../practice/readingPolicy";
import { HIDDEN_LESSON_CUE } from "../reading/fingerCues";

let root: Root;
let host: HTMLDivElement;
let store: AppStore;
let reading: ReturnType<typeof useReadingCourse>;
let now: number;
let visible: DocumentVisibilityState;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
const configureCourse = vi.fn();
const trainerRef = { current: { configureCourse } as unknown as Trainer };

function Harness({ blocked = false }: { blocked?: boolean }) {
  const value = useReadingCourse();
  useReadingTrainer(value, trainerRef, true, blocked);
  useEffect(() => {
    reading = value;
  });
  return null;
}
function render(blocked = false) {
  act(() => {
    root.render(withTestStore(<Harness blocked={blocked} />, store));
  });
}
function frame(atMs: number) {
  now = atMs;
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => {
      callback(atMs);
    });
  });
}
function selection(task: "notes" | "phrases" | "check" = "notes") {
  act(() => {
    store.dispatch(readingActions.select({ task, seed: 42 }));
  });
  return practiceForSelection("right");
}
function bassSelection(task: "notes" | "phrases" = "notes") {
  act(() => {
    reading.startBass(task);
  });
  return practiceForSelection("left");
}
function practiceForSelection(hand: "left" | "right") {
  if (!reading.exercise) throw new Error("No exercise");
  const practice = new PracticeSession(reading.exercise.song, {
    mode: "wait",
    hands: new Set([hand]),
    speed: 1,
    accompaniment: false
  });
  practice.seek(0, now, { leadIn: false });
  practice.tick(now);
  update(practice, true, now);
  return practice;
}
function update(practice: PracticeSession, playing: boolean, atMs: number) {
  now = atMs;
  act(() => {
    reading.policy?.onFrame(practice, playing, atMs);
  });
}
function present(atMs = now) {
  now = atMs;
  act(() => {
    const presentation = reading.presentation;
    if (presentation) presentation.onPresented(presentation.id, atMs);
  });
}
function event(practice: PracticeSession): KeyEvent {
  return {
    type: "down",
    pitch: practice.nextDue()[0]?.pitch ?? 60,
    velocity: 90,
    source: "pointer",
    timestamp: now
  };
}
function accepts(practice: PracticeSession) {
  return reading.policy?.allowInput(event(practice), practice, now);
}
function answer(practice: PracticeSession, atMs: number) {
  now = atMs;
  const input = event(practice);
  expect(accepts(practice)).toBe(true);
  act(() => {
    reading.policy?.onJudgement(input, practice.pressKeyAt(input.pitch, atMs), atMs, atMs);
  });
  practice.releaseKeyAt(input.pitch, atMs + 1, "pointer");
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  now = 1000;
  visible = "visible";
  frameId = 0;
  frames = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  configureCourse.mockClear();
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render();
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reading course presentation and trainer wiring", () => {
  it("uses the same allowed finger on the score and keyboard, clears it on the next note and in a check", () => {
    const practice = selection();
    const cueText = () =>
      new DOMParser()
        .parseFromString(reading.prompt?.musicXml ?? "", "application/xml")
        .querySelector('[data-lesson-finger-cue="true"] > text')?.textContent;
    present();
    // The row is reserved from the start, so the hint does not grow the staff.
    expect(cueText()).toBe(HIDDEN_LESSON_CUE);
    act(() => {
      reading.hint();
    });
    frame(1016);
    expect(cueText()).toBe(HIDDEN_LESSON_CUE);
    act(() => {
      reading.hint();
    });
    const cues = trainerGuidance(practice, reading.policy, true, false).frame.fingerCues;
    expect(cues).toHaveLength(1);
    expect(cueText()).toMatch(new RegExp(`${String(cues?.[0]?.recommendedFinger)}$`));
    const originalExercise = reading.exercise;
    answer(practice, 1100);
    practice.tick(1700);
    update(practice, true, 1700);
    expect(reading.exercise).toBe(originalExercise);
    expect(cueText()).toBe(HIDDEN_LESSON_CUE);
    expect(trainerGuidance(practice, reading.policy, true, false).frame.fingerCues).toEqual([]);
    selection("check");
    present();
    act(() => {
      reading.hint();
    });
    expect(reading.prompt?.musicXml).not.toContain("data-lesson-finger-cue");
    expect(reading.policy?.cuePitch()).toBeUndefined();
  });
  it("saves a complete bass run separately after a wrong octave without altering P2 evidence", async () => {
    await act(async () => {
      await store.readingPersistenceReady;
    });
    const previous = store.getState().reading;
    const profile = JSON.stringify(previous.profile);
    const practice = bassSelection();
    present();
    const pitch = practice.nextDue()[0]?.pitch;
    if (pitch === undefined) throw new Error("No bass pitch");
    const wrong = { ...event(practice), pitch: pitch + 12, timestamp: 1100 };
    act(() => {
      reading.policy?.onJudgement(wrong, practice.pressKeyAt(wrong.pitch, 1100), 1100, 1100);
    });
    expect(reading.snapshot?.answers).toEqual([]);
    answer(practice, 1200);
    for (let index = 1; index < 20; index++) {
      const arrival = 1000 + index * 700;
      practice.tick(arrival);
      update(practice, true, arrival);
      present(arrival);
      answer(practice, arrival + 100);
    }
    act(() => {
      reading.finish();
      reading.finish();
    });
    await act(async () => {
      await store.flushReadingPersistence();
    });
    expect(reading.bassResult?.notes).toHaveLength(20);
    expect(reading.bassResult?.notes[0]).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: true
    });
    expect(store.getState().reading.bass.history).toHaveLength(1);
    expect(store.getState().reading.history).toEqual(previous.history);
    expect(JSON.stringify(store.getState().reading.profile)).toBe(profile);
    expect(store.getState().reading.presentedFingerprints).toEqual(previous.presentedFingerprints);
    expect(store.getState().reading.intervals).toEqual(previous.intervals);
    expect(store.getState().reading.rhythm).toEqual(previous.rhythm);
    const sequence = reading.exercise?.song.notes.map((note) => note.pitch);
    act(() => {
      reading.newSeries();
    });
    expect(reading.exercise?.song.notes.map((note) => note.pitch)).not.toEqual(sequence);
    expect(reading.bassResult).toBeNull();
    expect(reading.snapshot?.answers).toEqual([]);
  });

  it("offers bass help even when the previous right-hand selection was a check", () => {
    selection("check");
    const practice = bassSelection("phrases");
    present();
    act(() => {
      reading.hint();
    });
    frame(1016);
    expect(reading.snapshot?.hintLevel).toBe(1);
    expect(reading.exercise?.song.notes.every((note) => note.hand === "left")).toBe(true);
    expect(reading.prompt?.musicXml.match(/<note[ >]/g)).toHaveLength(4);
    const session = reading.session;
    act(() => {
      reading.setBassSourceFilter("pointer");
    });
    expect(reading.session).toBe(session);
    answer(practice, 1100);
    expect(reading.snapshot?.answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: false,
      hintLevel: 1
    });
  });

  it("admits bass attacks only after the current presentation receipt, including delayed RAF callbacks", () => {
    const practice = bassSelection();
    now = 1050;
    act(() => {
      const presentation = reading.presentation;
      if (presentation) presentation.onPresented(presentation.id, 1000);
    });
    expect(reading.policy?.allowInput(event(practice), practice, 1049)).toBe(false);
    answer(practice, 1100);
    expect(reading.snapshot?.answers[0]?.responseLatencyMs).toBe(50);
    const old = reading.presentation;
    const next = selection();
    act(() => {
      old?.onPresented(old.id, 1200);
    });
    expect(accepts(next)).toBe(false);
    expect(reading.isBass).toBe(false);
    expect(store.getState().reading.bass.history).toEqual([]);
  });

  it("preserves an already presented legacy selection when different IndexedDB selection loads late", async () => {
    let release!: (saved: unknown) => void;
    const loaded = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const repository = createMemoryReadingRepository();
    store = createAppStore({
      storage: {
        getItem: (key) =>
          key === "reading-course-v1"
            ? JSON.stringify({ ...initialReadingState, schemaVersion: 1, task: "notes", seed: 1 })
            : null,
        setItem: () => undefined
      },
      readingRepository: { ...repository, load: () => loaded }
    });
    render();
    if (!reading.exercise) throw new Error("No restored exercise");
    const practice = new PracticeSession(reading.exercise.song, {
      mode: "wait",
      hands: new Set(["right"]),
      speed: 1,
      accompaniment: false
    });
    practice.seek(0, now, { leadIn: false });
    practice.tick(now);
    update(practice, true, now);
    present();
    const originalSession = reading.session;
    await act(async () => {
      release({ ...initialReadingState, schemaVersion: 2, task: "phrases", seed: 2 });
      await store.flushReadingPersistence();
    });
    expect(reading.task).toBe("notes");
    expect(reading.exercise.seed).toBe(1);
    expect(reading.session).toBe(originalSession);
    expect(accepts(practice)).toBe(true);
  });

  it("waits for authoritative history before choosing a check", async () => {
    let release!: (saved: unknown) => void;
    const loaded = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const repository = createMemoryReadingRepository();
    store = createAppStore({
      storage: { getItem: () => null, setItem: () => undefined },
      readingRepository: { ...repository, load: () => loaded }
    });
    render();
    const candidate = adaptation.chooseNewReadingCheck(1, []);
    if (!candidate) throw new Error("No candidate");
    const fingerprint = adaptation.readingFingerprint(candidate.exercise);
    const search = vi.spyOn(adaptation, "chooseNewReadingCheck");
    let selected!: Promise<boolean>;
    act(() => {
      selected = reading.start("check");
    });
    expect(search).not.toHaveBeenCalled();
    expect(reading.task).toBeNull();
    await act(async () => {
      release({ ...initialReadingState, presentedFingerprints: [fingerprint] });
      await selected;
    });
    expect(search).toHaveBeenCalledWith(1, expect.arrayContaining([fingerprint]), "check", "all");
    expect(reading.exercise && adaptation.readingFingerprint(reading.exercise)).not.toBe(
      fingerprint
    );
  });

  it("keeps a replayed check out of new-material evidence", async () => {
    const fingerprint = adaptation.readingFingerprint(generateReadingExercise("check", 42));
    await act(async () => {
      await store.readingPersistenceReady;
    });
    act(() => {
      store.dispatch(readingActions.presented(fingerprint));
    });
    const practice = selection("check");
    present();
    await act(async () => {
      await store.flushReadingPersistence();
    });
    for (let index = 0; index < 20; index++) {
      const arrival = 1000 + index * 700;
      practice.tick(arrival);
      update(practice, true, arrival);
      present(arrival);
      answer(practice, arrival + 100);
    }
    act(() => {
      reading.finish();
    });
    expect(reading.result?.newMaterial).toBe(false);
  });

  it("freezes the adaptive plan and keeps practice running while its source filter changes", () => {
    act(() => {
      void reading.startAdaptive();
    });
    const originalExercise = reading.exercise;
    const originalSession = reading.session;
    expect(store.getState().reading.plan?.purpose).toBe("adaptive");
    expect(store.getState().reading.plan?.counts).toEqual([4, 4, 4, 4, 4]);
    act(() => {
      reading.setSourceFilter("midi");
    });
    expect(store.getState().reading.sourceFilter).toBe("midi");
    expect(store.getState().reading.plan?.source).toBe("all");
    expect(reading.exercise).toBe(originalExercise);
    expect(reading.session).toBe(originalSession);
    act(() => {
      reading.newSeries();
    });
    expect(store.getState().reading.plan?.purpose).toBe("adaptive");
    expect(store.getState().reading.plan?.source).toBe("midi");
    expect(reading.session).not.toBe(originalSession);
  });

  it("keeps the prior practice when searching for a new check fails", async () => {
    const practice = selection();
    present();
    const originalSession = reading.session;
    vi.spyOn(adaptation, "chooseNewReadingCheck").mockReturnValue(null);
    await act(async () => {
      void reading.start("check");
      await store.readingPersistenceReady;
      await store.flushReadingPersistence();
    });
    expect(reading.generationError).toBe(true);
    expect(reading.session).toBe(originalSession);
    expect(accepts(practice)).toBe(true);
    expect(store.getState().reading.history).toEqual([]);
  });

  it("records a series once only after an actual current presentation", async () => {
    selection();
    expect(store.getState().reading.presentedFingerprints).toEqual([]);
    present();
    present();
    await act(async () => {
      await store.flushReadingPersistence();
    });
    expect(store.getState().reading.presentedFingerprints).toHaveLength(1);
    const originalSession = reading.session;
    const original = store.getState().reading;
    act(() => {
      store.dispatch(readingActions.hydrated({ ...original, history: [] }));
    });
    expect(reading.session).toBe(originalSession);
  });

  it("waits for a visible hint after a pause and records the actual shown level", () => {
    const practice = selection();
    expect(accepts(practice)).toBe(false);
    present();
    expect(accepts(practice)).toBe(true);
    act(() => {
      reading.hint();
    });
    expect(reading.hintLevel).toBe(1);
    expect(accepts(practice)).toBe(true);
    update(practice, false, 1020);
    frame(1040);
    expect(reading.session?.snapshot().hintLevel).toBe(1);
    update(practice, true, 2000);
    expect(accepts(practice)).toBe(true);
    frame(2016);
    frame(2032);
    expect(accepts(practice)).toBe(true);
    answer(practice, 2100);
    expect(reading.snapshot?.answers[0]).toMatchObject({
      hintLevel: 1,
      firstAttemptCorrect: true,
      independentCorrect: false,
      responseLatencyMs: 120
    });
  });

  it("ignores obsolete render callbacks after changing task and keeps errors suspended", () => {
    const practice = selection();
    const obsolete = reading.presentation;
    const next = selection("phrases");
    act(() => {
      obsolete?.onPresented(obsolete.id, now);
      obsolete?.onError(obsolete.id);
    });
    expect(reading.renderError).toBe(false);
    expect(reading.snapshot?.presented).toBe(false);
    expect(accepts(next)).toBe(false);
    present();
    const failed = reading.presentation;
    act(() => {
      if (failed) failed.onError(failed.id);
    });
    update(next, true, 1200);
    expect(reading.renderError).toBe(true);
    expect(accepts(next)).toBe(false);
    act(() => {
      reading.onRetry();
    });
    expect(reading.presentation?.id).not.toBe(failed?.id);
    act(() => {
      failed?.onError(failed.id);
      failed?.onPresented(failed.id, 1300);
    });
    expect(reading.renderError).toBe(false);
    update(next, true, 1350);
    expect(accepts(next)).toBe(false);
    present(1400);
    update(next, true, 1400);
    answer(next, 1500);
    expect(reading.snapshot?.answers).toHaveLength(1);
    expect(practice.stats().hits).toBe(0);
  });

  it("accepts MIDI input stamped before an automatically requested hint", () => {
    const practice = selection();
    present(1000);
    update(practice, true, 6100);
    expect(reading.hintLevel).toBe(1);
    answer(practice, 5990);
    expect(reading.snapshot?.answers[0]).toMatchObject({
      independentCorrect: true,
      hintLevel: 0,
      responseLatencyMs: 4990
    });
  });

  it("counts key help only when the trainer actually draws its cue", () => {
    const practice = selection();
    present();
    act(() => {
      reading.hint();
    });
    frame(1016);
    act(() => {
      reading.hint();
    });
    expect(reading.session?.snapshot().hintLevel).toBe(1);
    const pitch = practice.nextDue()[0]?.pitch;
    expect(reading.policy?.cuePitch()).toBe(pitch);
    if (pitch === undefined) throw new Error("No pitch");
    act(() => {
      reading.policy?.onCuePresented?.(pitch, 1032);
    });
    answer(practice, 1100);
    expect(reading.snapshot?.answers[0]).toMatchObject({ independentCorrect: false, hintLevel: 2 });
  });

  it("excludes loading and hidden-tab intervals while preserving the current exercise", () => {
    const practice = selection();
    present();
    const original = reading.session;
    now = 1100;
    render(true);
    expect(accepts(practice)).toBe(false);
    now = 2100;
    render(false);
    update(practice, true, 2100);
    now = 2200;
    visible = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(accepts(practice)).toBe(false);
    visible = "visible";
    update(practice, true, 3200);
    answer(practice, 3300);
    expect(reading.session).toBe(original);
    expect(reading.snapshot?.answers[0]?.responseLatencyMs).toBe(300);
  });

  it("saves exactly one completed result and starts the next series with a fresh session", async () => {
    const practice = selection("check");
    for (let index = 0; index < 20; index++) {
      const arrival = 1000 + index * 700;
      practice.tick(arrival);
      update(practice, true, arrival);
      present(arrival);
      answer(practice, arrival + 100);
    }
    expect(reading.snapshot?.completed).toBe(true);
    act(() => {
      reading.finish();
    });
    act(() => {
      reading.finish();
    });
    expect(store.getState().reading.history).toHaveLength(1);
    expect(reading.result?.notes).toHaveLength(20);
    expect(reading.result?.notes.every((note) => note.independentCorrect)).toBe(true);
    const oldExercise = reading.exercise;
    await act(async () => {
      reading.newSeries();
      await store.flushReadingPersistence();
    });
    expect(reading.exercise?.song.notes.map((note) => note.pitch)).not.toEqual(
      oldExercise?.song.notes.map((note) => note.pitch)
    );
    expect(reading.result).toBeNull();
    expect(reading.snapshot?.answers).toEqual([]);
    expect(store.getState().reading.history).toHaveLength(1);
  });
});
