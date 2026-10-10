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

let root: Root;
let host: HTMLDivElement;
let store: AppStore;
let reading: ReturnType<typeof useReadingCourse>;
let now: number;
let visible: DocumentVisibilityState;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
const configureReading = vi.fn();
const trainerRef = { current: { configureReading } as unknown as Trainer };

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
  if (!reading.exercise) throw new Error("No exercise");
  const practice = new PracticeSession(reading.exercise.song, {
    mode: "wait",
    hands: new Set(["right"]),
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
  configureReading.mockClear();
  store = createAppStore({ storage: { getItem: () => null, setItem: () => undefined } });
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

  it("saves exactly one completed result and starts the next series with a fresh session", () => {
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
    act(() => {
      reading.newSeries();
    });
    expect(reading.exercise?.song.notes.map((note) => note.pitch)).not.toEqual(
      oldExercise?.song.notes.map((note) => note.pitch)
    );
    expect(reading.result).toBeNull();
    expect(reading.snapshot?.answers).toEqual([]);
    expect(store.getState().reading.history).toHaveLength(1);
  });
});
