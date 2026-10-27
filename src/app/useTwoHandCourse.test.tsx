// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_LESSON_CUE } from "../reading/fingerCues";
import { PracticeSession } from "../practice/session";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { createMemoryReadingRepository } from "./readingRepository";
import { useTwoHandCourse, useTwoHandTrainer } from "./useTwoHandCourse";
import type { Trainer } from "../practice/Trainer";
import type { KeyEvent } from "../input/midiInput";

/** Hint rows stay reserved under the notes; only their text tells a shown hint. */
function shownLyrics(xml = "") {
  return Array.from(
    new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("lyric > text"),
    (text) => text.textContent
  ).filter((text) => text !== HIDDEN_LESSON_CUE);
}
let root: Root, host: HTMLDivElement, store: AppStore;
let course: ReturnType<typeof useTwoHandCourse>, now: number;
const configureCourse = vi.fn(),
  setPlaying = vi.fn();
const trainerRef = {
  current: { configureCourse, setPlaying, cancelInput: vi.fn() } as unknown as Trainer
};
function Harness({ connect = false }: { connect?: boolean }) {
  const value = useTwoHandCourse();
  useTwoHandTrainer(value, trainerRef, connect, false);
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
function select() {
  act(() => {
    course.start();
  });
  if (!course.exercise) throw new Error("No pair exercise");
  const practice = new PracticeSession(course.exercise.song, {
    mode: "wait",
    hands: new Set(["left", "right"]),
    speed: 1,
    accompaniment: false,
    noteResult: false
  });
  practice.seek(0, now, { leadIn: false });
  practice.tick(now);
  update(practice, now);
  return practice;
}
function present() {
  const receipt = course.presentation;
  if (!receipt) throw new Error("No presentation");
  act(() => {
    receipt.onPresented(receipt.id, now);
  });
}
function update(practice: PracticeSession, atMs: number, commit = true) {
  now = atMs;
  act(() => {
    const ids = course.policy?.onFrame(practice, true, atMs);
    if (ids && commit) {
      const accepted = practice.commitWaitingGroup(ids, atMs) !== undefined;
      course.policy?.onCommit?.(ids, accepted, atMs);
    }
  });
}
function input(practice: PracticeSession, type: "down" | "up", pitch: number, atMs: number) {
  now = atMs;
  const event: KeyEvent = { type, pitch, velocity: 90, source: "keyboard", timestamp: atMs };
  act(() => course.policy?.onInput(event, practice, true, atMs, atMs, atMs));
}
function solve(practice: PracticeSession) {
  present();
  update(practice, now);
  const pitches = course.pair?.pitches;
  if (!pitches) throw new Error("No current pair");
  const start = now;
  input(practice, "down", pitches[0], start + 10);
  input(practice, "down", pitches[1], start + 110);
  expect(practice.stats().hits % 2).toBe(0);
  input(practice, "up", pitches[0], start + 120);
  input(practice, "up", pitches[1], start + 130);
  update(practice, start + 381);
}
describe("two-hand course shell", () => {
  it("ignores late audio readiness after leaving the course", async () => {
    select();
    let ready: () => void = () => undefined;
    const audio = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const pending = course.playAgain(() => audio);
    act(() => {
      course.exit();
    });
    await act(async () => {
      ready();
      await pending;
    });
    expect(store.getState().reading.activeCourse).toBeNull();
    expect(course.playRequestedRef.current).toBe(false);
  });
  it("does not carry shown help into a new run with the same first pair ID", () => {
    const practice = select();
    present();
    update(practice, now);
    act(() => {
      course.hint();
    });
    act(() => {
      course.hint();
    });
    expect(course.hintLevel).toBe(2);
    act(() => {
      course.policy?.onCuePresented?.(required(course.pair).pitches, now);
    });
    act(() => {
      course.newSeries();
    });
    expect(course.hintLevel).toBe(0);
    expect(shownLyrics(course.prompt?.musicXml)).toEqual([]);
    expect(course.policy?.cuePitches()).toEqual([]);
    act(() => {
      course.exit();
    });
    act(() => {
      course.start();
    });
    expect(course.hintLevel).toBe(0);
    expect(shownLyrics(course.prompt?.musicXml)).toEqual([]);
  });
  it("presents exact current pair and saves only after ten atomic accepted commits", async () => {
    const practice = select();
    for (let index = 0; index < 10; index++) {
      update(practice, now);
      expect(course.index).toBe(index);
      expect(course.prompt?.musicXml.match(/<note /g)).toHaveLength(2);
      solve(practice);
      expect(practice.stats().hits).toBe((index + 1) * 2);
      if (index < 9) {
        now += 600;
        practice.tick(now);
      }
    }
    expect(course.result?.pairs).toHaveLength(10);
    expect(store.getState().reading.coordination.history).toHaveLength(1);
    act(() => {
      course.finish();
      course.finish();
    });
    expect(store.getState().reading.coordination.history).toHaveLength(1);
    expect(store.getState().reading.history).toHaveLength(0);
    expect(store.getState().reading.bass.history).toHaveLength(0);
    expect(store.getState().reading.profile.observations).toHaveLength(0);
    const previousSong = required(course.exercise).song;
    const seed = required(course.exercise).seed;
    await act(async () => {
      await course.playAgain(() => Promise.resolve());
    });
    expect(required(course.exercise).seed).toBe(seed);
    expect(required(course.exercise).song).not.toBe(previousSong);
    expect(course.snapshot?.answers).toHaveLength(0);
    expect(course.result).toBeNull();
    expect(course.hintLevel).toBe(0);
    expect(course.playRequestedRef.current).toBe(true);
    expect(store.getState().reading.coordination.history).toHaveLength(1);
    act(() => {
      root.render(withTestStore(<Harness connect />, store));
    });
    expect(configureCourse).toHaveBeenLastCalledWith("pair", course.policy);
    expect(setPlaying).toHaveBeenCalledWith(true);
    expect(course.playRequestedRef.current).toBe(false);
  });
  it("requires presentation and cancels a candidate without accepting partial hits", () => {
    const practice = select(),
      pitches = required(course.pair).pitches;
    input(practice, "down", pitches[0], 1010);
    input(practice, "down", pitches[1], 1020);
    present();
    update(practice, now);
    expect(course.snapshot?.answers).toHaveLength(0);
    input(practice, "up", pitches[0], 1030);
    input(practice, "up", pitches[1], 1040);
    input(practice, "down", pitches[0], 1050);
    input(practice, "down", pitches[1], 1060);
    act(() => course.policy?.cancel(1070, false));
    input(practice, "up", pitches[0], 1080);
    input(practice, "up", pitches[1], 1090);
    update(practice, 1400);
    expect(practice.stats().hits).toBe(0);
    expect(course.snapshot?.answers).toHaveLength(0);
    expect(store.getState().reading.coordination.history).toHaveLength(0);
  });
  it("rejects stale staff receipts after selecting a new series and resets interrupted runs", () => {
    const practice = select();
    present();
    const old = required(course.presentation);
    const oldSeed = required(course.exercise).seed;
    solve(practice);
    act(() => {
      course.newSeries();
    });
    expect(required(course.exercise).seed).not.toBe(oldSeed);
    expect(course.snapshot?.answers).toHaveLength(0);
    act(() => {
      old.onPresented(old.id, 2000);
    });
    expect(course.snapshot?.presented).toBe(false);
    expect(store.getState().reading.coordination.history).toHaveLength(0);
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing fixture value");
  return value;
}
