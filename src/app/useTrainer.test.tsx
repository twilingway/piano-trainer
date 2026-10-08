// @vitest-environment happy-dom
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { TrainerSnapshot } from "../practice/Trainer";
import type { Song } from "../song/song";
import type { Take } from "../recording/take";
import { useTrainer } from "./useTrainer";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { preferencesActions } from "./preferencesSlice";
import { practiceActions } from "./practiceSlice";
let store: AppStore;
import { useI18n } from "./useI18n";
import { setInterfaceLanguage } from "./interfaceLanguage";

const mocks = vi.hoisted(() => ({
  trainers: [] as {
    onSnapshot?: (snapshot: TrainerSnapshot) => void;
    load: ReturnType<typeof vi.fn>;
    setPlaying: ReturnType<typeof vi.fn>;
    seek: ReturnType<typeof vi.fn>;
    destroyed: boolean;
  }[],
  views: [] as { destroyed: boolean }[]
}));
vi.mock("../audio/pianoSound", () => ({ soundNoteOn: vi.fn(), soundNoteOff: vi.fn() }));
vi.mock("../render/FallingNotesView", () => ({
  FallingNotesView: class {
    destroyed = false;
    constructor() {
      mocks.views.push(this);
    }
    mount() {
      return Promise.resolve();
    }
    destroy() {
      this.destroyed = true;
    }
  }
}));
vi.mock("../practice/Trainer", () => ({
  Trainer: class {
    onSnapshot?: (snapshot: TrainerSnapshot) => void;
    destroyed = false;
    load = vi.fn(() => this.onSnapshot?.(snapshot()));
    setPlaying = vi.fn();
    seek = vi.fn();
    observeTextNotes = vi.fn();
    constructor() {
      mocks.trainers.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
}));
const song: Song = {
  title: "test",
  source: "midi",
  notes: [{ id: "a", pitch: 60, start: 2, startBeat: 4, duration: 1, hand: "right" }],
  duration: 3,
  measures: [],
  beats: []
};
const snapshot = (overrides: Partial<TrainerSnapshot> = {}): TrainerSnapshot => ({
  playing: false,
  waiting: false,
  finished: false,
  time: 0,
  beat: 0,
  timingPolicy: "strict",
  stats: { hits: 0, misses: 0, wrong: 0, meanOffset: 0, troubleSpots: [] },
  ...overrides
});
let root: Root;
let host: HTMLDivElement;
let value: ReturnType<typeof useTrainer>;
let renders: number;
const startFromRef = { current: null as number | null };
const handlers = { onNoteClick: vi.fn(), onTake: vi.fn(), onReplay: vi.fn() };
let ensureSound: () => Promise<void>;
interface Replay {
  song: Song;
  take: Take;
  count: number;
}
function Harness({
  ranked = false,
  selectedSong = song,
  sourceSong = selectedSong,
  replay,
  course
}: {
  ranked?: boolean;
  selectedSong?: Song;
  sourceSong?: Song;
  replay?: Replay | undefined;
  course?: Parameters<typeof useTrainer>[0]["course"];
}) {
  renders++;
  const { locale } = useI18n();
  const trainer = useTrainer({
    song: selectedSong,
    sourceSong,
    songKey: selectedSong.title,
    ranked,
    course,
    startFromRef,
    ensureSound,
    ...handlers,
    comparing: !!replay,
    compareSong: replay?.song,
    lastTake: replay ?? null,
    replayCount: replay?.count ?? 0
  });
  useEffect(() => {
    value = trainer;
  });
  // eslint-disable-next-line react-hooks/refs -- Pass the host ref to React without reading current.
  return <div ref={trainer.hostRef} data-locale={locale} />;
}
const active = () => {
  const trainer = mocks.trainers.findLast((entry) => !entry.destroyed);
  if (!trainer) throw new Error("Trainer not mounted");
  return trainer;
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  store = createAppStore();
  mocks.trainers.length = 0;
  mocks.views.length = 0;
  renders = 0;
  ensureSound = () => Promise.resolve();
  startFromRef.current = null;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    setInterfaceLanguage("ru");
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(
  ranked = false,
  selectedSong = song,
  sourceSong = selectedSong,
  replay?: Replay,
  course?: Parameters<typeof useTrainer>[0]["course"]
) {
  await act(async () => {
    root.render(
      withTestStore(
        <StrictMode>
          <Harness
            ranked={ranked}
            selectedSong={selectedSong}
            sourceSong={sourceSong}
            replay={replay}
            course={course}
          />
        </StrictMode>,
        store
      )
    );
    await Promise.resolve();
  });
}

describe("trainer runtime isolation", () => {
  it("leaves a newly chosen phrase paused after listening to the previous phrase", async () => {
    const course = {
      stage: "right" as const,
      context: "task-a",
      accompaniment: false,
      onStage: vi.fn(),
      onAccompaniment: vi.fn()
    };
    await mount(false, song, song, undefined, course);
    await act(async () => {
      await value.toggleListening();
    });
    expect(value.listening).toBe(true);
    expect(value.handChoice).toBe("listen");
    const nextSong = { ...song, title: "next phrase" };
    active().setPlaying.mockClear();
    await mount(false, nextSong, nextSong, undefined, { ...course, context: "task-b" });
    expect(value.listening).toBe(false);
    expect(value.handChoice).toBe("right");
    expect(active().load).toHaveBeenLastCalledWith(
      nextSong,
      expect.objectContaining({ hands: new Set(["right"]) }),
      nextSong.title,
      { preservePosition: false, runContext: "task-b" }
    );
    expect(active().setPlaying).not.toHaveBeenCalled();
  });
  it("uses course hands and accompaniment without changing ordinary preferences", async () => {
    const onStage = vi.fn();
    const onAccompaniment = vi.fn();
    store.dispatch(preferencesActions.playerChanged({ handChoice: "left", accompaniment: true }));
    store.dispatch(practiceActions.partRoleChosen("melody"));
    const course = {
      stage: "right" as const,
      context: "synthetic-task",
      accompaniment: false,
      onStage,
      onAccompaniment
    };
    await mount(false, song, song, undefined, course);
    expect(active().load).toHaveBeenLastCalledWith(
      song,
      expect.objectContaining({ hands: new Set(["right"]), accompaniment: false }),
      song.title,
      { preservePosition: false, runContext: "synthetic-task" }
    );
    await act(async () => {
      value.setHandChoice("both");
      value.playChoice.parts?.onAccompaniment(true);
      await Promise.resolve();
    });
    expect(onStage).toHaveBeenCalledWith("both");
    expect(onAccompaniment).toHaveBeenCalledWith(true);
    expect(store.getState().preferences.player).toMatchObject({
      handChoice: "left",
      accompaniment: true
    });
    expect(store.getState().practice.partRole).toBe("melody");
  });
  it("does not reload practice when the course display changes without changing its task", async () => {
    const course = {
      stage: "right" as const,
      context: "synthetic-task",
      accompaniment: false,
      onStage: vi.fn(),
      onAccompaniment: vi.fn()
    };
    await mount(false, song, song, undefined, course);
    const trainer = active();
    trainer.load.mockClear();
    await mount(false, song, song, undefined, { ...course });
    expect(trainer.load).not.toHaveBeenCalled();
    await mount();
    expect(trainer.load).toHaveBeenLastCalledWith(
      song,
      expect.objectContaining({ hands: new Set(["right"]), accompaniment: true }),
      song.title,
      { preservePosition: true }
    );
  });
  it("keeps a paused listen-through paused when its speed changes", async () => {
    await mount();
    await act(async () => {
      await value.toggleListening();
    });
    const trainer = active();
    trainer.setPlaying.mockClear();
    await act(async () => {
      value.setSpeed(0.5);
      await Promise.resolve();
    });
    expect(trainer.load).toHaveBeenLastCalledWith(song, expect.anything(), song.title, {
      preservePosition: true
    });
    expect(trainer.setPlaying).not.toHaveBeenCalled();
  });

  it("preserves a paused comparison on settings changes but resets an explicit replay", async () => {
    const replay: Replay = {
      song,
      count: 0,
      take: {
        id: "take",
        songKey: song.title,
        createdAt: "2026-10-07",
        mode: "tempo",
        speed: 1,
        hands: ["right"],
        from: 2,
        notes: [],
        pedal: []
      }
    };
    await mount(false, song, song, replay);
    const trainer = active();
    trainer.seek.mockClear();
    trainer.setPlaying.mockClear();
    await act(async () => {
      value.setSpeed(0.5);
      await Promise.resolve();
    });
    expect(trainer.load).toHaveBeenLastCalledWith(song, expect.anything(), `${song.title}:replay`, {
      preservePosition: true
    });
    expect(trainer.seek).not.toHaveBeenCalled();
    expect(trainer.setPlaying).not.toHaveBeenCalled();
    const variant = { ...song };
    await mount(false, song, song, { ...replay, song: variant });
    expect(trainer.load).toHaveBeenLastCalledWith(
      variant,
      expect.anything(),
      `${song.title}:replay`,
      { preservePosition: true }
    );
    expect(trainer.setPlaying).not.toHaveBeenCalled();
    await mount(false, song, song, { ...replay, count: 1 });
    expect(trainer.load).toHaveBeenLastCalledWith(song, expect.anything(), `${song.title}:replay`, {
      preservePosition: false
    });
    expect(trainer.seek).toHaveBeenLastCalledWith(2);
    expect(trainer.setPlaying).toHaveBeenLastCalledWith(true);
  });

  it("hands a completed listen-through back to practice from the beginning", async () => {
    await mount();
    await act(async () => {
      await value.toggleListening();
    });
    expect(value.listening).toBe(true);
    await act(async () => {
      active().onSnapshot?.(snapshot({ finished: true, time: song.duration }));
      await Promise.resolve();
    });
    expect(value.listening).toBe(false);
    expect(active().load).toHaveBeenLastCalledWith(song, expect.anything(), song.title, {
      preservePosition: false
    });
  });

  it("keeps position for mode, hand and speed changes without seeking back to a staff click", async () => {
    await mount();
    const trainer = active();
    startFromRef.current = 2;
    for (const change of [
      { mode: "tempo" as const },
      { handChoice: "left" as const },
      { speed: 0.5 }
    ]) {
      await act(async () => {
        store.dispatch(preferencesActions.playerChanged(change));
        await Promise.resolve();
      });
      expect(trainer.load).toHaveBeenLastCalledWith(song, expect.anything(), song.title, {
        preservePosition: true
      });
    }
    expect(trainer.seek).not.toHaveBeenCalled();
  });

  it("preserves transformed variants but resets a new source with the same title", async () => {
    await mount();
    const variant = { ...song, notes: song.notes.map((note) => ({ ...note, pitch: 62 })) };
    await mount(false, variant, song);
    expect(active().load).toHaveBeenLastCalledWith(variant, expect.anything(), song.title, {
      preservePosition: true
    });
    await mount(false, { ...song });
    expect(active().load).toHaveBeenLastCalledWith(song, expect.anything(), song.title, {
      preservePosition: false
    });
  });

  it("keeps explicit restart as a reset and preserves subsequent preference changes", async () => {
    await mount();
    startFromRef.current = 2;
    await act(async () => {
      value.restart();
      await Promise.resolve();
    });
    expect(startFromRef.current).toBeNull();
    expect(active().load).toHaveBeenLastCalledWith(song, expect.anything(), song.title);
    await act(async () => {
      value.setSpeed(0.5);
      await Promise.resolve();
    });
    expect(active().load).toHaveBeenLastCalledWith(song, expect.anything(), song.title, {
      preservePosition: true
    });
  });

  it("applies Ranked rules without overwriting saved raw player preferences", async () => {
    store.dispatch(
      preferencesActions.playerChanged({
        mode: "wait",
        handChoice: "listen",
        speed: 0.25,
        accompaniment: false
      })
    );
    await mount(true);
    expect(value.mode).toBe("tempo");
    expect(value.handChoice).toBe("both");
    expect(value.speed).toBe(1);
    expect(store.getState().preferences.player).toMatchObject({
      mode: "wait",
      handChoice: "listen",
      speed: 0.25,
      accompaniment: false
    });
    expect(JSON.parse(localStorage.getItem("player-prefs") ?? "null")).toMatchObject({
      mode: "wait",
      handChoice: "listen",
      speed: 0.25,
      accompaniment: false
    });
    await mount(false);
    expect(value.mode).toBe("wait");
    expect(value.handChoice).toBe("listen");
    expect(value.speed).toBe(0.25);
  });

  it("keeps the same song, clock and playing trainer when the interface language changes", async () => {
    await mount();
    const trainer = active();
    const loads = trainer.load.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      trainer.onSnapshot?.(snapshot({ time: 12, beat: 24, playing: true }));
      setInterfaceLanguage("en");
    });
    expect(active()).toBe(trainer);
    expect(host.querySelector("[data-locale]")?.getAttribute("data-locale")).toBe("en");
    expect(trainer.load).toHaveBeenCalledTimes(loads);
    expect(value.snapshotSource.getSnapshot()).toMatchObject({ time: 12, beat: 24, playing: true });
    expect(mocks.views.filter((view) => !view.destroyed)).toHaveLength(1);
  });

  it("publishes time without rendering its owner and preserves one live trainer/view in StrictMode", async () => {
    await mount();
    const count = renders;
    await act(async () => {
      await Promise.resolve();
      active().onSnapshot?.(snapshot({ time: 12 }));
    });
    expect(renders).toBe(count);
    expect(value.snapshotSource.getSnapshot()?.time).toBe(12);
    expect(mocks.trainers.filter((trainer) => !trainer.destroyed)).toHaveLength(1);
    expect(mocks.views.filter((view) => !view.destroyed)).toHaveLength(1);
    await mount(false, { ...song, title: "other" });
    expect(mocks.trainers.filter((trainer) => !trainer.destroyed)).toHaveLength(1);
    expect(active().load).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "other" }),
      expect.anything(),
      "other",
      { preservePosition: false }
    );
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(mocks.trainers.every((trainer) => trainer.destroyed)).toBe(true);
    expect(mocks.views.every((view) => view.destroyed)).toBe(true);
    expect(value.snapshotSource.getSnapshot()).toBeNull();
    root = createRoot(host);
  });

  it("reads current playing and finished after asynchronous sound initialization", async () => {
    let resolveSound: () => void = () => undefined;
    ensureSound = () =>
      new Promise<void>((resolve) => {
        resolveSound = resolve;
      });
    await mount();
    const command = value.togglePlay;
    let pending: Promise<void>;
    await act(async () => {
      await Promise.resolve();
      pending = command();
    });
    await act(async () => {
      await Promise.resolve();
      active().onSnapshot?.(snapshot({ playing: true }));
    });
    await act(async () => {
      resolveSound();
      await pending;
    });
    expect(active().setPlaying).toHaveBeenLastCalledWith(false);
    const loads = active().load.mock.calls.length;
    await act(async () => {
      await Promise.resolve();
      pending = command();
      active().onSnapshot?.(snapshot({ finished: true }));
    });
    await act(async () => {
      resolveSound();
      await pending;
    });
    expect(active().load).toHaveBeenCalledTimes(loads + 1);
    expect(active().setPlaying).toHaveBeenLastCalledWith(true);
  });

  it("guards ranked hand changes with the latest snapshot and seeks using the same trainer", async () => {
    await mount(true);
    const initial = value.handChoice;
    await act(async () => {
      await Promise.resolve();
      active().onSnapshot?.(snapshot({ playing: true }));
      value.setHandChoice("left");
    });
    expect(value.handChoice).toBe(initial);
    await act(async () => {
      await Promise.resolve();
      active().onSnapshot?.(snapshot());
      value.setHandChoice("left");
    });
    expect(value.handChoice).toBe("left");
    await act(async () => {
      value.seekToBeat(4);
      await Promise.resolve();
    });
    expect(startFromRef.current).toBe(2);
    expect(active().seek).toHaveBeenLastCalledWith(2);
    expect(active().setPlaying).toHaveBeenLastCalledWith(true);
  });
});
