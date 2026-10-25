// @vitest-environment happy-dom
import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhrasePreviewRequest } from "../audio/phrasePreview";
import { PracticeSession } from "../practice/session";
import type { Trainer } from "../practice/Trainer";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import { readingActions } from "./readingSlice";
import { createAppStore, type AppStore } from "./store";
import { createMemoryReadingRepository } from "./readingRepository";
import { withTestStore } from "./storeTestSupport";
import { useMusicCourse } from "./useMusicCourse";
import { useMusicTrainer, musicClockAllowed } from "./useMusicTrainer";
import { useGameRuntime } from "./useGameRuntime";

const audio = vi.hoisted(() => ({
  request: null as PhrasePreviewRequest | null,
  interrupted: new Set<() => void>(),
  start: vi.fn<() => Promise<void>>()
}));
vi.mock("../audio/pianoSound", () => ({
  startPianoSound: () => audio.start(),
  onPianoSoundInterrupted: (callback: () => void) => {
    audio.interrupted.add(callback);
    return () => audio.interrupted.delete(callback);
  }
}));
vi.mock("../audio/phrasePreview", () => ({
  createPhrasePreview: () => ({
    play: (request: PhrasePreviewRequest) => {
      audio.request = request;
      return Promise.resolve(true);
    },
    cancel: () => undefined,
    dispose: () => undefined
  })
}));
let root: Root, host: HTMLDivElement, store: AppStore, now: number;
let music: ReturnType<typeof useMusicCourse>;
let policy: TrainerMusicPolicy | null;
let practice: PracticeSession | null;
let playing: boolean;
const configureCourse = vi.fn((_kind: "music", next: TrainerMusicPolicy | null) => {
  policy = next;
  next?.seedHeld([], now);
});
const setPlaying = vi.fn((next: boolean) => {
  if (!practice) return;
  if (next) {
    practice.resumeClock(now);
    playing = policy?.onStart(practice, now, []) ?? false;
    if (!playing) practice.pauseClock(now);
  } else {
    playing = false;
    practice.pauseClock(now);
    policy?.cancel(now);
  }
});
const configureControls = vi.fn((controls: { canStart: boolean }) => {
  if (playing && !controls.canStart) setPlaying(false);
});
const trainerRef = {
  current: { configureCourse, setPlaying, configureControls } as unknown as Trainer
};
function Harness() {
  const value = useMusicCourse();
  useMusicTrainer(value, trainerRef, true, false, [], "all");
  useGameRuntime(trainerRef, true, {
    loop: false,
    ranked: false,
    stopOnError: false,
    rankedReady: false,
    deviceId: "",
    performance: false,
    resumeWhenReady: false,
    canStart: musicClockAllowed(value.active, value.view)
  });
  useEffect(() => {
    music = value;
  });
  return null;
}
async function flush() {
  await act(async () => {
    for (let index = 0; index < 20; index++) await Promise.resolve();
  });
}
function scene() {
  if (!music.scene) throw new Error("Missing real music scene");
  return music.scene;
}
async function select(course: "sight-reading" | "harmony" | "dictation") {
  await act(async () => {
    store.dispatch(
      readingActions.musicPreferencesChanged({
        sightPreviewSeconds: 5,
        sightLevel: "notes",
        harmonyLesson: "tone-semitone",
        inputSource: "keyboard",
        purpose: "training"
      })
    );
    store.dispatch(readingActions.musicSelected({ course, seed: 42, purpose: "training" }));
    for (let index = 0; index < 20; index++) await Promise.resolve();
  });
  await flush();
  practice = new PracticeSession(
    scene().song,
    music.options ?? { mode: "tempo", hands: new Set(["right"]), speed: 1 }
  );
  practice.startClock(now);
  practice.pauseClock(now);
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  audio.request = null;
  now = 1000;
  playing = false;
  policy = null;
  practice = null;
  audio.start.mockResolvedValue();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  await store.readingPersistenceReady;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      withTestStore(
        <StrictMode>
          <Harness />
        </StrictMode>,
        store
      )
    );
    await Promise.resolve();
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(audio.interrupted.size).toBe(0);
});

describe("real music controller wired to the hooks and existing PracticeSession", () => {
  it("prepares, starts and saves one harmony choice without self-pausing or duplicate history", async () => {
    await select("harmony");
    const presentation = music.presentation;
    if (!presentation) throw new Error("Missing presentation callback");
    act(() => {
      presentation.onPresented(presentation.id, now);
    });
    expect(music.ready).toBe(true);
    expect(music.view.canStart).toBe(true);
    await act(async () => {
      music.command("start");
      await Promise.resolve();
    });
    expect(playing).toBe(true);
    expect(music.view.status).toBe("playing");
    const pitches = scene().notes.map((note) => note.pitch);
    const answer = String((pitches[1] ?? 0) - (pitches[0] ?? 0));
    act(() => {
      music.choose(answer, "keyboard");
    });
    expect(music.view.status).toBe("result");
    expect(store.getState().reading.music.history).toHaveLength(1);
    expect(store.getState().reading.music.history[0]?.course).toBe("harmony");
    act(() => {
      music.command("finish");
    });
    expect(store.getState().reading.music.history).toHaveLength(1);
  });
  it("runs the finite preview on policy frames before starting the musical answer clock", async () => {
    await select("sight-reading");
    expect(policy).not.toBeNull();
    const presentation = music.presentation;
    if (!presentation || !practice || !policy) throw new Error("Missing preview setup");
    act(() => {
      presentation.onPresented(presentation.id, now);
    });
    expect(music.view.status).toBe("preview");
    expect(music.staffVisible).toBe(true);
    now += 5001;
    act(() => {
      if (practice) policy?.onFrame(practice, false, now);
    });
    expect(music.view.status).toBe("ready");
    expect(music.staffVisible).toBe(false);
    expect(playing).toBe(false);
  });
  it("opens hidden-score dictation listening without waiting for an invisible staff receipt", async () => {
    await select("dictation");
    expect(music.staffVisible).toBe(false);
    expect(music.view.canListen).toBe(true);
    act(() => {
      music.command("listen");
    });
    expect(audio.request?.material.notes).toEqual(scene().notes);
    expect(music.view.status).toBe("listening");
  });
});
