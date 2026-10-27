// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_LESSON_CUE } from "../reading/fingerCues";
import { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { createMemoryReadingRepository } from "./readingRepository";
import { useHeldBassCourse, useHeldBassTrainer } from "./useHeldBassCourse";

/** Hint rows stay reserved under the notes; only their text tells a shown hint. */
function shownLyrics(xml = "") {
  return Array.from(
    new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("lyric > text"),
    (text) => text.textContent
  ).filter((text) => text !== HIDDEN_LESSON_CUE);
}
let root: Root, host: HTMLDivElement, store: AppStore, now: number;
let course: ReturnType<typeof useHeldBassCourse>;
const configureCourse = vi.fn(),
  setPlaying = vi.fn();
const trainerRef = {
  current: { configureCourse, setPlaying, cancelInput: vi.fn() } as unknown as Trainer
};
function Harness({ connect = false }: { connect?: boolean }) {
  const value = useHeldBassCourse();
  useHeldBassTrainer(value, trainerRef, connect, false);
  useEffect(() => {
    course = value;
  });
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(withTestStore(<Harness />, store));
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing held-bass value");
  return value;
}
function practiceForScene() {
  const scene = required(course.scene);
  const practice = new PracticeSession(scene.song, {
    mode: "wait",
    hands: new Set(["left", "right"]),
    speed: 1,
    accompaniment: false,
    noteResult: false,
    countInBeats: 0
  });
  expect(practice.registerVerifiedOnsets(required(course.policy).onsets)).toBe(true);
  practice.startClock(now);
  practice.tick(now);
  const shown = required(course.presentation);
  act(() => {
    shown.onPresented(shown.id, now);
  });
  frame(practice, now);
  return practice;
}
function select() {
  act(() => {
    course.start();
  });
  return practiceForScene();
}
function frame(practice: PracticeSession, at: number, playing = true) {
  now = at;
  practice.tick(at);
  act(() => {
    const policy = required(course.policy);
    const request = policy.onFrame(practice, playing, at, practice.clockReceipt(at));
    if (request) {
      const accepted = practice.commitVerifiedOnset(request, at) !== undefined;
      expect(accepted).toBe(true);
      policy.onCommit?.(request, accepted, practice.clockReceipt(at));
    }
  });
}
function input(practice: PracticeSession, type: "down" | "up", pitch: number, at: number) {
  now = at;
  practice.tick(at);
  act(() => {
    course.policy?.onInput(
      { type, pitch, velocity: 90, source: "keyboard", timestamp: at },
      practice,
      true,
      at,
      at,
      at,
      practice.clockReceipt(at)
    );
  });
}
function firstOnset(practice: PracticeSession) {
  const fragment = required(course.fragment),
    start = now;
  input(practice, "down", fragment.bassPitch, start + 10);
  input(practice, "down", required(fragment.melodyPitches[0]), start + 110);
  input(practice, "up", required(fragment.melodyPitches[0]), start + 120);
  frame(practice, start + 361);
  expect(practice.stats().hits).toBe(2);
  expect(course.snapshot?.step).toBe(1);
}
function solve(practice: PracticeSession) {
  const fragment = required(course.fragment);
  firstOnset(practice);
  for (let step = 1; step < fragment.steps.length; step++) {
    const start = now + 500;
    frame(practice, start);
    expect(course.snapshot?.ready).toBe(true);
    input(practice, "down", required(fragment.melodyPitches[step]), start + 10);
    input(practice, "up", required(fragment.melodyPitches[step]), start + 20);
    frame(practice, start + 261);
  }
  const end = now + 500;
  frame(practice, end);
  expect(course.snapshot?.status).toBe("release");
  expect(course.snapshot?.answers).toHaveLength(course.index);
  input(practice, "up", fragment.bassPitch, end + 1);
  frame(practice, end + 251);
  expect(course.snapshot?.answers).toHaveLength(course.index);
  frame(practice, end + 252);
}
describe("held bass course shell with the actual single clock", () => {
  it("finishes ten fresh scenes only after physical release and saves once", async () => {
    let practice = select();
    for (let index = 0; index < 10; index++) {
      expect(course.index).toBe(index);
      const oldScene = required(course.scene);
      solve(practice);
      if (index < 9) {
        expect(required(course.scene).song).not.toBe(oldScene.song);
        now += 100;
        practice = practiceForScene();
      }
    }
    expect(course.result?.fragments).toHaveLength(10);
    expect(store.getState().reading.heldBass.history).toHaveLength(1);
    act(() => {
      course.finish();
      course.finish();
    });
    expect(store.getState().reading.heldBass.history).toHaveLength(1);
    expect(store.getState().reading.coordination.history).toHaveLength(0);
    expect(store.getState().reading.profile.observations).toHaveLength(0);
    const oldSong = required(course.scene).song,
      seed = required(course.exercise).seed;
    await act(async () => {
      await course.playAgain(() => Promise.resolve());
    });
    expect(required(course.exercise).seed).toBe(seed);
    expect(required(course.scene).song).not.toBe(oldSong);
    expect(course.snapshot?.answers).toHaveLength(0);
    expect(course.result).toBeNull();
    expect(course.playRequestedRef.current).toBe(true);
    act(() => {
      root.render(withTestStore(<Harness connect />, store));
    });
    expect(configureCourse).toHaveBeenLastCalledWith("heldBass", course.policy);
    expect(setPlaying).toHaveBeenCalledWith(true);
  });
  it("retries the whole current fragment and rejects receipts from its old scene", () => {
    const practice = select(),
      fragment = required(course.fragment);
    const oldScene = required(course.scene),
      shown = required(course.presentation),
      oldPolicy = required(course.policy);
    act(() => {
      course.hint();
    });
    act(() => {
      course.hint();
    });
    act(() => {
      oldPolicy.onCuePresented?.(oldPolicy.cuePitches(), now);
    });
    firstOnset(practice);
    input(practice, "up", fragment.bassPitch, now + 10);
    expect(course.snapshot?.answers).toHaveLength(0);
    frame(practice, now + 251);
    expect(required(course.scene).song).not.toBe(oldScene.song);
    expect(required(course.policy).onsets.presentationId).not.toBe(oldPolicy.onsets.presentationId);
    expect(course.snapshot?.step).toBe(0);
    act(() => {
      shown.onPresented(shown.id, now);
      oldPolicy.onFrame(practice, true, now, practice.clockReceipt(now));
    });
    expect(course.snapshot?.presented).toBe(false);
    const retried = practiceForScene();
    expect(course.hintLevel).toBe(2);
    expect(course.policy?.cuePitches()).toEqual([fragment.bassPitch, fragment.melodyPitches[0]]);
    solve(retried);
    const answer = required(course.snapshot?.answers[0]);
    expect(answer.attempts.map((attempt) => attempt.outcome)).toEqual(["early-release", "success"]);
    expect(answer.firstAttemptCorrect).toBe(false);
  });
  it("shows help only for the current waiting step and never changes the score scene", () => {
    const practice = select(),
      scene = required(course.scene);
    act(() => {
      course.hint();
    });
    act(() => {
      course.hint();
    });
    expect(course.hintLevel).toBe(2);
    expect(course.policy?.cuePitches()).toEqual([
      required(course.fragment).bassPitch,
      required(course.fragment).melodyPitches[0]
    ]);
    act(() => {
      course.policy?.onCuePresented?.(required(course.policy).cuePitches(), now);
    });
    firstOnset(practice);
    expect(course.hintLevel).toBe(0);
    expect(course.policy?.cuePitches()).toEqual([]);
    expect(course.scene).toBe(scene);
    expect(shownLyrics(course.prompt?.musicXml)).toEqual([]);
    frame(practice, now + 500);
    act(() => {
      course.hint();
    });
    expect(course.hintLevel).toBe(1);
    expect(course.scene).toBe(scene);
  });
  it("cancels on pause without a graded error and requires a fresh scene", () => {
    const practice = select(),
      oldScene = required(course.scene),
      bass = required(course.fragment).bassPitch;
    firstOnset(practice);
    frame(practice, now + 10, false);
    input(practice, "up", bass, now + 10);
    frame(practice, now + 251, false);
    expect(required(course.scene).song).not.toBe(oldScene.song);
    expect(course.playRequestedRef.current).toBe(false);
    const fresh = practiceForScene();
    solve(fresh);
    expect(course.snapshot?.answers[0]?.attempts).toHaveLength(1);
    expect(course.snapshot?.answers[0]?.firstAttemptCorrect).toBe(true);
  });
  it("ignores late audio readiness after exit", async () => {
    select();
    let resolve: () => void = () => undefined;
    const audio = new Promise<void>((ready) => {
      resolve = ready;
    });
    const pending = course.playAgain(() => audio);
    act(() => {
      course.exit();
    });
    await act(async () => {
      resolve();
      await pending;
    });
    expect(course.active).toBe(false);
    expect(course.playRequestedRef.current).toBe(false);
    expect(store.getState().reading.heldBass.history).toHaveLength(0);
  });
});
