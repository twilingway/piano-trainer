// @vitest-environment happy-dom
import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { musicResultFixture } from "../musicLearning/progressFixture";
import { DEFAULT_STAFF_PREFS } from "./staffPreferences";
import type { StaffPrefs } from "./staffPreferences";
import { createMusicExercise } from "../musicLearning/material";
import type { Trainer } from "../practice/Trainer";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type {
  MusicCourseCallbacks,
  MusicCourseConnection,
  MusicCourseControllerContract,
  MusicCourseSelection,
  MusicCourseSnapshot
} from "./musicCourseContracts";
import { readingActions } from "./readingSlice";
import { preferencesActions } from "./preferencesSlice";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { createMemoryReadingRepository } from "./readingRepository";
import { useMusicCourse } from "./useMusicCourse";
import { useMusicTrainer, usePracticeDisplayPrefs } from "./useMusicTrainer";
import { lessonFingerCues } from "../reading/fingerCues";
import { getInterfaceLanguage, setInterfaceLanguage } from "./interfaceLanguage";

type MockController = MusicCourseControllerContract & {
  snapshot: MusicCourseSnapshot;
  readonly listeners: Set<() => void>;
};
const mocks = vi.hoisted(() => ({
  controllers: [] as MockController[],
  callbacks: [] as MusicCourseCallbacks[],
  interrupted: new Set<() => void>()
}));
vi.mock("../audio/pianoSound", () => ({
  onPianoSoundInterrupted: (callback: () => void) => {
    mocks.interrupted.add(callback);
    return () => mocks.interrupted.delete(callback);
  }
}));
vi.mock("./musicCourseController", () => ({
  MusicCourseController: class implements MusicCourseControllerContract {
    readonly selection: MusicCourseSelection;
    readonly listeners = new Set<() => void>();
    snapshot: MusicCourseSnapshot;
    activate = vi.fn();
    dispose = vi.fn();
    refreshConnection = vi.fn<(value: MusicCourseConnection) => void>();
    present = vi.fn();
    staffError = vi.fn();
    command = vi.fn();
    choose = vi.fn();
    cancel = vi.fn();
    readonly policyValue = { seedHeld: vi.fn() } as unknown as TrainerMusicPolicy;
    policy = vi.fn(() => this.policyValue);
    subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    getSnapshot = () => this.snapshot;
    constructor(selection: MusicCourseSelection, callbacks: MusicCourseCallbacks) {
      this.selection = selection;
      const scene = createMusicExercise({
        id: `scene-${String(selection.revision)}`,
        seed: selection.saved.seed,
        bpm: 120,
        notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, hand: "right" }]
      });
      this.snapshot = {
        scene,
        staffXml: scene.musicXml,
        staffVisible: false,
        keysVisible: true,
        options: { mode: "tempo", hands: new Set(["right"]), speed: 1 },
        view: {
          course: selection.saved.course ?? "sight-reading",
          inputSource: selection.saved.inputSource,
          status: "preview",
          taskKind: "sight-reading",
          ready: false,
          allReleased: false,
          canStart: false,
          canListen: false,
          canFinish: false,
          canNext: false,
          canHelp: true,
          showHelp: false
        }
      };
      mocks.controllers.push(this);
      mocks.callbacks.push(callbacks);
    }
  }
}));

let host: HTMLDivElement, root: Root, store: AppStore;
let music: ReturnType<typeof useMusicCourse>;
let displayPrefs: StaffPrefs;
let blocked: boolean, trainerReady: boolean, visibility: DocumentVisibilityState;
let selectedDeviceId: string;
let devices: { id: string; name: string }[];
const configureCourse = vi.fn();
const trainerRef = { current: { configureCourse } as unknown as Trainer };
function current() {
  const value = mocks.controllers.findLast(
    (controller) => vi.mocked(controller.activate).mock.calls.length > 0
  );
  if (!value) throw new Error("Missing music controller");
  return value;
}
function callbacks() {
  const value = mocks.callbacks[mocks.controllers.indexOf(current())];
  if (!value) throw new Error("Missing music callbacks");
  return value;
}
function Harness() {
  const value = useMusicCourse();
  useMusicTrainer(value, trainerRef, trainerReady, blocked, devices, selectedDeviceId);
  const display = usePracticeDisplayPrefs({
    practiceActive: value.active,
    ear: false,
    music: value,
    staffPrefs: DEFAULT_STAFF_PREFS,
    performance: false,
    courseActive: false,
    courseView: "staff"
  });
  useEffect(() => {
    music = value;
    displayPrefs = display;
  });
  return null;
}
function render() {
  act(() => {
    root.render(
      withTestStore(
        <StrictMode>
          <Harness />
        </StrictMode>,
        store
      )
    );
  });
}
function select(course: "sight-reading" | "dictation" = "sight-reading") {
  act(() => {
    store.dispatch(readingActions.musicSelected({ course, seed: 42, purpose: "training" }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.controllers.length = 0;
  mocks.callbacks.length = 0;
  mocks.interrupted.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  blocked = false;
  trainerReady = true;
  visibility = "visible";
  selectedDeviceId = "all";
  devices = [];
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  await store.readingPersistenceReady;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(mocks.interrupted.size).toBe(0);
});

describe("music hook selection identity", () => {
  it("localizes only the allowed XML hand cue without duplicating an existing numeric finger", () => {
    select();
    const controller = current();
    const scene = controller.snapshot.scene;
    if (!scene) throw new Error("No scene");
    const previousLocale = getInterfaceLanguage();
    const cue = lessonFingerCues(scene.song.notes);
    act(() => {
      setInterfaceLanguage("ru");
      controller.snapshot = { ...controller.snapshot, fingerCues: cue, fingeringVisible: true };
      for (const listener of controller.listeners) listener();
    });
    const label = () =>
      new DOMParser()
        .parseFromString(music.staffXml ?? "", "application/xml")
        .querySelector('[data-lesson-finger-cue="true"] > text')?.textContent;
    expect(label()).toBe("П");
    act(() => {
      setInterfaceLanguage("en");
    });
    expect(label()).toBe("R");
    act(() => {
      controller.snapshot = { ...controller.snapshot, fingeringVisible: false };
      for (const listener of controller.listeners) listener();
    });
    expect(label()).toBe(`R${String(cue[0]?.recommendedFinger)}`);
    act(() => {
      controller.snapshot = { ...controller.snapshot, fingerCues: [] };
      for (const listener of controller.listeners) listener();
    });
    expect(label()).toBeUndefined();
    expect(music.scene).toBe(scene);
    act(() => {
      setInterfaceLanguage(previousLocale);
    });
  });
  it("stays inactive until a music course is selected", () => {
    expect(music.active).toBe(false);
    expect(music.scene).toBeNull();
    expect(mocks.controllers).toHaveLength(0);
    select();
    expect(music.active).toBe(true);
    expect(music.exercise).toBe(music.scene);
    expect(current().selection.saved.seed).toBe(42);
  });
  it("keeps the same controller across preferences, seed receipt and integrated/history writes", () => {
    select();
    const controller = current();
    const count = mocks.controllers.length;
    act(() => {
      store.dispatch(
        readingActions.musicPreferencesChanged({ sightPreviewSeconds: 5, dictationLength: 8 })
      );
    });
    expect(current()).toBe(controller);
    expect(mocks.controllers).toHaveLength(count);
    expect(music.preferences.dictationLength).toBe(8);
    act(() => {
      callbacks().rememberSeed(99);
    });
    expect(store.getState().reading.music.seed).toBe(99);
    expect(current()).toBe(controller);
    expect(mocks.controllers).toHaveLength(count);
    act(() => {
      store.dispatch(readingActions.musicIntegratedChanged(null));
    });
    expect(current()).toBe(controller);
  });
  it("changes only ephemeral library presentation without resetting an active music run", () => {
    select();
    const controller = current(),
      count = mocks.controllers.length,
      before = store.getState();
    const scene = music.scene,
      policy = music.policy;
    vi.mocked(controller.command).mockClear();
    vi.mocked(controller.cancel).mockClear();
    vi.mocked(controller.dispose).mockClear();
    act(() => {
      music.setProgressOpen(true);
      music.setCourseFilter("harmony");
      music.setPurposeFilter("control");
    });
    expect(music.progressOpen).toBe(true);
    expect(music.courseFilter).toBe("harmony");
    expect(music.purposeFilter).toBe("control");
    expect(music.scene).toBe(scene);
    expect(music.policy).toBe(policy);
    expect(store.getState()).toBe(before);
    expect(mocks.controllers).toHaveLength(count);
    expect(current()).toBe(controller);
    expect(controller.command).not.toHaveBeenCalled();
    expect(controller.cancel).not.toHaveBeenCalled();
    expect(controller.dispose).not.toHaveBeenCalled();
  });
  it("keeps an active answer when next-run purpose or stored results change", () => {
    select();
    const controller = current();
    const count = mocks.controllers.length;
    act(() => {
      music.setPreferences({ purpose: "control" });
      callbacks().save(musicResultFixture("sight-reading", "history-hook"));
    });
    expect(store.getState().reading.music.purpose).toBe("control");
    expect(store.getState().reading.music.history).toHaveLength(1);
    expect(current()).toBe(controller);
    expect(mocks.controllers).toHaveLength(count);
    expect(controller.selection.saved.purpose).toBe("training");
  });
  it("provides latest next-run selection without replacing the active controller", () => {
    select();
    const controller = current();
    const captured = controller.selection.saved;
    const readSelection = callbacks().readSelection;
    if (!readSelection) throw new Error("Missing production readSelection callback");
    const revision = store.getState().reading.selectionRevision;
    act(() => {
      music.setPreferences({
        purpose: "control",
        sightPreviewSeconds: 6,
        dictationLength: 8,
        sourceFilter: "midi"
      });
      callbacks().rememberSeed(100);
    });
    expect(readSelection()).toBe(store.getState().reading.music);
    expect(readSelection()).toMatchObject({
      purpose: "control",
      sightPreviewSeconds: 6,
      dictationLength: 8,
      seed: 100
    });
    expect(current()).toBe(controller);
    expect(controller.selection.saved).toBe(captured);
    expect(captured).toMatchObject({ purpose: "training", seed: 42 });
    expect(store.getState().reading.selectionRevision).toBe(revision);
  });
  it("fails closed when the existing novelty journal is unavailable", async () => {
    select();
    vi.spyOn(store, "knownReadingFingerprints").mockResolvedValueOnce(null);
    await expect(callbacks().known()).rejects.toThrow("Music history unavailable");
  });
  it("creates a new controller on source/selection revision and guards stale staff callbacks", () => {
    select();
    const old = current();
    const shown = music.presentation;
    if (!shown) throw new Error("Missing music presentation");
    act(() => {
      music.setPreferences({ inputSource: "pointer" });
    });
    expect(current()).not.toBe(old);
    expect(current().selection.saved.inputSource).toBe("pointer");
    act(() => {
      shown.onPresented(shown.id, 10);
      shown.onError(shown.id);
    });
    expect(old.present).not.toHaveBeenCalled();
    expect(old.staffError).not.toHaveBeenCalled();
  });
  it("keeps the legacy replacement callback current and rejects stale seed receipts", () => {
    select();
    const oldCallbacks = callbacks();
    act(() => {
      music.setPreferences({ sightPreviewSeconds: 6 });
      callbacks().rememberSeed(100);
    });
    act(() => {
      callbacks().retry();
    });
    expect(current().selection.saved.seed).toBe(101);
    expect(current().selection.saved.sightPreviewSeconds).toBe(6);
    act(() => {
      oldCallbacks.rememberSeed(999);
    });
    expect(store.getState().reading.music.seed).toBe(101);
  });
  it("uses existing persistence claim and known journal rather than a parallel store", async () => {
    select();
    await callbacks().persistenceReady();
    expect(await callbacks().claim("music-hook-test")).toBe(true);
    expect(await callbacks().claim("music-hook-test")).toBe(false);
    expect(await callbacks().known()).toContain("music-hook-test");
  });
  it("routes commands/choice and exit; retry refreshes the staff attempt counter", () => {
    select();
    const controller = current();
    act(() => {
      music.command("listen");
      music.choose("3", "keyboard");
      music.command("retry");
    });
    expect(controller.command).toHaveBeenCalledWith("listen");
    expect(controller.choose).toHaveBeenCalledWith("3", "keyboard");
    expect(music.retry).toBe(1);
    act(() => {
      callbacks().exit();
    });
    expect(music.active).toBe(false);
    expect(controller.dispose).toHaveBeenCalled();
  });
});

describe("music bridge preparation and interruption", () => {
  it("installs policy before view readiness, to observe preheld keys and preview frames", () => {
    select();
    expect(music.ready).toBe(false);
    expect(configureCourse).toHaveBeenCalledWith("music", music.policy);
    expect(current().refreshConnection).toHaveBeenCalledWith(
      expect.objectContaining({ trainer: trainerRef.current, blocked: false })
    );
  });
  it("does not configure until the trainer is ready and clears policy on exit", () => {
    trainerReady = false;
    render();
    select();
    expect(configureCourse).not.toHaveBeenCalledWith("music", music.policy);
    trainerReady = true;
    render();
    expect(configureCourse).toHaveBeenCalledWith("music", music.policy);
    act(() => {
      callbacks().exit();
    });
    expect(configureCourse).toHaveBeenLastCalledWith("music", null);
  });
  it("refreshes blocked state, device selection and timing without recreating the controller", () => {
    select();
    const controller = current();
    blocked = true;
    devices = [{ id: "piano", name: "Piano" }];
    render();
    expect(controller.refreshConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: true, deviceId: "piano" })
    );
    act(() => {
      store.dispatch(
        preferencesActions.timingChanged({
          ...store.getState().preferences.timing,
          manualOffsetMs: 12
        })
      );
    });
    expect(current()).toBe(controller);
    expect(vi.mocked(controller.refreshConnection).mock.lastCall?.[0]).toMatchObject({
      timing: { manualOffsetMs: 12 }
    });
    devices = [
      { id: "piano", name: "Piano" },
      { id: "other", name: "Other" }
    ];
    render();
    expect(controller.refreshConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: undefined })
    );
  });
  it("uses music visibility without leaking the hidden score or changing saved preferences", () => {
    select();
    expect(displayPrefs.visible).toBe(false);
    expect(displayPrefs.keys).toBe(true);
    expect(displayPrefs.lane).toBe(false);
    expect(displayPrefs.labels).toBe(false);
    expect(DEFAULT_STAFF_PREFS.visible).toBe(true);
  });
  it("publishes explicit fingering help without changing readiness, scene or policy identity", () => {
    select();
    const controller = current();
    const originalScene = music.scene;
    const originalPolicy = music.policy;
    const originalReady = music.ready;
    expect(music.fingeringVisible).toBe(false);
    vi.mocked(configureCourse).mockClear();
    act(() => {
      controller.snapshot = { ...controller.snapshot, fingeringVisible: true };
      for (const listener of controller.listeners) listener();
    });
    expect(music.fingeringVisible).toBe(true);
    expect(displayPrefs.fingers).toBe(true);
    expect(music.ready).toBe(originalReady);
    expect(music.scene).toBe(originalScene);
    expect(music.policy).toBe(originalPolicy);
    expect(configureCourse).not.toHaveBeenCalled();
  });
  it.each(["playing", "listening", "reply"] as const)(
    "cancels %s on hidden/context interruption",
    (status) => {
      select();
      const controller = current();
      act(() => {
        controller.snapshot = {
          ...controller.snapshot,
          view: { ...controller.snapshot.view, status }
        };
        for (const listener of controller.listeners) listener();
      });
      vi.mocked(controller.cancel).mockClear();
      visibility = "hidden";
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(controller.cancel).toHaveBeenCalledOnce();
      vi.mocked(controller.cancel).mockClear();
      act(() => {
        for (const interrupt of mocks.interrupted) interrupt();
      });
      expect(controller.cancel).toHaveBeenCalledOnce();
    }
  );
  it("blocks hidden previews through connection refresh without cancelling the unfinished preview", () => {
    select();
    const controller = current();
    vi.mocked(controller.cancel).mockClear();
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(controller.cancel).not.toHaveBeenCalled();
    expect(controller.refreshConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({ blocked: true })
    );
    for (const interrupt of mocks.interrupted) interrupt();
    expect(controller.cancel).not.toHaveBeenCalled();
  });
});
