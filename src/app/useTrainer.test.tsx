// @vitest-environment happy-dom
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { TrainerSnapshot } from "../practice/Trainer";
import type { Song } from "../song/song";
import { useTrainer } from "./useTrainer";
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
function Harness({
  ranked = false,
  selectedSong = song
}: {
  ranked?: boolean;
  selectedSong?: Song;
}) {
  renders++;
  const { locale } = useI18n();
  const trainer = useTrainer({
    song: selectedSong,
    songKey: selectedSong.title,
    ranked,
    startFromRef,
    ensureSound,
    ...handlers,
    comparing: false,
    compareSong: undefined,
    lastTake: null,
    replayCount: 0
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
async function mount(ranked = false, selectedSong = song) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness ranked={ranked} selectedSong={selectedSong} />
      </StrictMode>
    );
    await Promise.resolve();
  });
}

describe("trainer runtime isolation", () => {
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
      "other"
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
