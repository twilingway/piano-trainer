// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useBeginnerCourse } from "./useBeginnerCourse";
import { useReadingCourse, useReadingTrainer } from "./useReadingCourse";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { createMemoryReadingRepository } from "./readingRepository";
import type { emptyBeginnerProgress } from "../beginner/progress";
import { mergeBeginnerProgress, readBeginnerProgress } from "../beginner/progress";
import { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import type { KeyEvent } from "../input/midiInput";
const repo = vi.hoisted<{
  saved: unknown;
  fail: boolean;
  pendingLoad: Promise<ReturnType<typeof emptyBeginnerProgress>> | null;
}>(() => ({ saved: undefined, fail: false, pendingLoad: null }));
vi.mock("./beginnerRepository", () => ({
  beginnerRepository: {
    load: () =>
      repo.fail
        ? Promise.reject(new Error("future schema"))
        : (repo.pendingLoad ?? Promise.resolve(readBeginnerProgress(repo.saved))),
    save: (value: ReturnType<typeof emptyBeginnerProgress>, changed: boolean) => {
      if (repo.fail) return Promise.reject(new Error("future schema"));
      repo.saved = mergeBeginnerProgress(repo.saved, value, changed);
      return Promise.resolve();
    }
  }
}));
let host: HTMLDivElement, root: Root, store: AppStore;
let beginner: ReturnType<typeof useBeginnerCourse>, reading: ReturnType<typeof useReadingCourse>;
let now = 1000;
const configureCourse = vi.fn();
const trainerRef = { current: { configureCourse } as unknown as Trainer };
function Harness() {
  const b = useBeginnerCourse();
  const r = useReadingCourse(undefined, b);
  useReadingTrainer(r, trainerRef, true, b.intro);
  useEffect(() => {
    beginner = b;
    reading = r;
  });
  return null;
}
async function mount() {
  await act(async () => {
    root.render(withTestStore(<Harness />, store));
    await Promise.resolve();
  });
}
function practice() {
  if (!reading.exercise) throw new Error("No source");
  return new PracticeSession(reading.exercise.song, {
    mode: "wait",
    speed: 1,
    hands: new Set([beginner.stage?.hand ?? "right"]),
    accompaniment: false
  });
}
function solve(count: number) {
  const p = practice();
  for (const note of reading.exercise?.song.notes.slice(0, count) ?? []) {
    now += 1000;
    p.seek(note.start, now, { leadIn: false });
    p.tick(now);
    act(() => {
      reading.policy?.onFrame(p, true, now);
    });
    act(() => {
      const shown = reading.presentation;
      if (shown) shown.onPresented(shown.id, now);
    });
    act(() => {
      reading.policy?.onFrame(p, true, now);
    });
    const event: KeyEvent = {
      type: "down",
      pitch: note.pitch,
      velocity: 90,
      source: "pointer",
      timestamp: now + 10
    };
    expect(reading.policy?.allowInput(event, p, now + 10)).toBe(true);
    act(() => {
      reading.policy?.onJudgement(event, p.pressKeyAt(note.pitch, now + 10), now + 10, now + 10);
    });
    p.releaseKeyAt(note.pitch, now + 11, "pointer");
  }
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  repo.saved = undefined;
  repo.fail = false;
  repo.pendingLoad = null;
  now = 1000;
  configureCourse.mockClear();
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await mount();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("beginner course through the real reading adapter", () => {
  it("plays a complete guided and independent series with pointer input, keeping old history separate", async () => {
    act(() => {
      beginner.start("beginner-v1-right-1");
    });
    expect(beginner.intro).toBe(true);
    act(() => {
      beginner.guided();
    });
    solve(6);
    expect(reading.snapshot?.completed).toBe(true);
    expect(reading.snapshot?.answers.every((n) => n.hintLevel === 1 && !n.independentCorrect)).toBe(
      true
    );
    await act(async () => {
      reading.finish();
      await Promise.resolve();
    });
    expect(beginner.completed).toEqual([]);
    expect(store.getState().reading.history).toEqual([]);
    expect(store.getState().reading.bass.history).toEqual([]);
    act(() => {
      beginner.independentStart();
    });
    expect(reading.exercise?.task).toBe("check");
    solve(6);
    expect(reading.hintLevel).toBe(0);
    await act(async () => {
      reading.finish();
      await Promise.resolve();
    });
    expect(beginner.completed).toEqual(["beginner-v1-right-1"]);
    expect(readBeginnerProgress(repo.saved).history).toHaveLength(2);
    act(() => {
      beginner.next();
    });
    expect(beginner.selection?.stageId).toBe("beginner-v1-right-2");
    expect(configureCourse.mock.calls.every((c) => c[0] === "reading")).toBe(true);
  });
  it("does not award partial or canceled work and isolates stale presentations, policy and finish", async () => {
    act(() => {
      beginner.start("beginner-v1-left-2");
      beginner.guided();
    });
    // Starting and changing phase are separate user events.
    act(() => {
      beginner.guided();
    });
    solve(2);
    await act(async () => {
      reading.finish();
      await Promise.resolve();
    });
    expect(beginner.history).toEqual([]);
    const old = reading,
      oldFinish = beginner.finish,
      oldExercise = reading.exercise;
    const session = reading.session;
    act(() => {
      beginner.exit();
    });
    act(() => {
      old.presentation?.onPresented(old.presentation.id, now);
      old.presentation?.onError(old.presentation.id);
      old.finish();
    });
    expect(oldExercise).not.toBeNull();
    expect(session).not.toBeNull();
    if (!oldExercise || !session) throw new Error("Expected a live exercise and reading session");
    for (const note of oldExercise.song.notes.slice(2)) {
      session.prepare(note.id, note.pitch, now);
      session.setActive(true, now);
      session.present(note.id, now);
      session.answer(note.pitch, "keyboard", now + 10);
      now += 20;
    }
    const result = session.result("late-run", Date.now());
    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected a valid stale completed run");
    act(() => {
      oldFinish(result);
    });
    expect(beginner.selection).toBeNull();
    expect(beginner.history).toEqual([]);
    expect(beginner.completed).toEqual([]);
    expect(reading.active).toBe(false);
  });
  it("restores stage, phase and seed on reload, resetting current answers", async () => {
    act(() => {
      beginner.start("beginner-v1-left-3");
    });
    act(() => {
      beginner.guided();
    });
    solve(1);
    const selected = beginner.selection,
      id = reading.exercise?.id;
    await act(async () => {
      await Promise.resolve();
      root.render(null);
    });
    await mount();
    expect(beginner.selection).toEqual(selected);
    expect(reading.exercise?.id).toBe(id);
    expect(reading.snapshot?.answers).toEqual([]);
    expect(reading.isBass).toBe(true);
  });
  async function deferSavedCompletion() {
    act(() => {
      beginner.start("beginner-v1-right-1");
    });
    act(() => {
      beginner.independentStart();
    });
    solve(6);
    await act(async () => {
      reading.finish();
      await Promise.resolve();
    });
    const saved = readBeginnerProgress(repo.saved);
    expect(saved.completed).toEqual(["beginner-v1-right-1"]);
    let resolveLoad: ((value: typeof saved) => void) | undefined;
    repo.pendingLoad = new Promise((resolve) => {
      resolveLoad = resolve;
    });
    await act(async () => {
      root.render(null);
      await Promise.resolve();
    });
    await mount();
    expect(beginner.loaded).toBe(false);
    return async () => {
      const resolve = resolveLoad;
      if (!resolve) throw new Error("Expected deferred loading callback");
      await act(async () => {
        resolve(saved);
        await Promise.resolve();
      });
    };
  }
  it("merges a late saved completion while preserving a newly selected stage and live answers", async () => {
    const finishLoading = await deferSavedCompletion();
    act(() => {
      beginner.start("beginner-v1-left-2");
    });
    act(() => {
      beginner.guided();
    });
    solve(1);
    const selection = beginner.selection;
    const session = reading.session;
    await finishLoading();
    expect(beginner.selection).toEqual(selection);
    expect(beginner.completed).toEqual(["beginner-v1-right-1"]);
    expect(beginner.history).toHaveLength(1);
    expect(reading.session).toBe(session);
    expect(reading.snapshot?.answers).toHaveLength(1);
  });
  it("merges late history after exit without reviving the saved selection", async () => {
    const finishLoading = await deferSavedCompletion();
    act(() => {
      beginner.start("beginner-v1-left-2");
    });
    act(() => {
      beginner.exit();
    });
    await finishLoading();
    expect(beginner.selection).toBeNull();
    expect(beginner.completed).toEqual(["beginner-v1-right-1"]);
    expect(beginner.history).toHaveLength(1);
    expect(reading.active).toBe(false);
  });
  it("remains playable and shows a storage error when a future schema prevents writing", async () => {
    repo.fail = true;
    await act(async () => {
      beginner.start("beginner-v1-right-1");
      await Promise.resolve();
    });
    expect(beginner.error).toBe(true);
    act(() => {
      beginner.independentStart();
    });
    solve(6);
    await act(async () => {
      reading.finish();
      await Promise.resolve();
    });
    expect(beginner.error).toBe(true);
    expect(repo.saved).toBeUndefined();
    repo.fail = false;
    await act(async () => {
      beginner.retrySave();
      await Promise.resolve();
    });
    expect(beginner.error).toBe(false);
    expect(readBeginnerProgress(repo.saved).completed).toEqual(["beginner-v1-right-1"]);
  });
});
