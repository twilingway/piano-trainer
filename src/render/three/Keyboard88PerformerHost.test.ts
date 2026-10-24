import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandsLayer } from "../HandsLayer";
import type { KeysScene } from "../NativeKeyboardScene";
import type { ThreeStage } from "./ThreeStage";
import type { HandsSource } from "./liveHands";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  construct: vi.fn(),
  setSong: vi.fn(),
  setVisibility: vi.fn(),
  dispose: vi.fn(),
  pose: vi.fn(),
  fail: vi.fn(),
  failed: false
}));

vi.mock("./keyboard88Loader", () => ({
  Keyboard88PerformerLoader: class {
    state = "idle";
    private source: string | undefined;
    async load(source?: string) {
      if (source === this.source && this.state === "failed") return undefined;
      this.source = source;
      this.state = "pending";
      await mocks.fetch();
      this.state = "ready";
      return {};
    }
    fail(error: unknown) {
      mocks.fail(error);
      this.state = "failed";
    }
    cancel() {
      if (this.state !== "failed") this.state = "idle";
    }
    dispose() {
      this.state = "disposed";
    }
  }
}));

vi.mock("./Keyboard88Performer", () => ({
  Keyboard88Performer: class {
    space = {};
    constructor() {
      mocks.construct();
      if (mocks.failed) throw new Error("binding failed");
    }
    setSong = mocks.setSong;
    setVisibility = mocks.setVisibility;
    dispose = mocks.dispose;
    follow = vi.fn();
    pose = mocks.pose;
    setSeparateCameras = vi.fn();
  }
}));

import { Keyboard88PerformerHost } from "./Keyboard88PerformerHost";

function fixture() {
  const listeners = new Set<(notes: HandsSource["notes"]) => void>();
  const hands = {
    pianist: false,
    container: { visible: true },
    songNotes: { left: [], right: [] } as HandsSource["notes"],
    subscribeSong(listener: (notes: HandsSource["notes"]) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  const stage = { addToKeys: vi.fn(), removeFromKeys: vi.fn() };
  const host = new Keyboard88PerformerHost();
  const sync = () => {
    host.sync(stage as unknown as ThreeStage, {} as KeysScene, hands as unknown as HandsLayer);
  };
  return { host, hands, listeners, stage, sync };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("public performer lifetime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.failed = false;
  });

  it("does not fetch or dispose for a song change or hands off/on", async () => {
    const f = fixture();
    f.sync();
    await settle();
    f.sync();
    expect(f.host.ready).toBe(true);
    mocks.setSong.mockClear();
    const next = { left: [], right: [] };
    f.hands.songNotes = next;
    for (const listener of f.listeners) listener(next);
    // The song setter builds the plan before another render/sync.
    expect(mocks.setSong).toHaveBeenCalledExactlyOnceWith(next);
    f.hands.container.visible = false;
    f.sync();
    expect(f.host.ready).toBe(false);
    expect(mocks.setVisibility).toHaveBeenLastCalledWith(false, false);
    f.hands.container.visible = true;
    f.sync();
    expect(f.host.ready).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.dispose).not.toHaveBeenCalled();
    f.host.clear();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(f.listeners.size).toBe(0);
  });

  it("seats the body before the stage first measures its floor", async () => {
    const f = fixture();
    f.sync();
    await settle();
    f.sync();
    const posed = mocks.pose.mock.invocationCallOrder[0] ?? Infinity;
    const added = f.stage.addToKeys.mock.invocationCallOrder[0] ?? -Infinity;
    expect(posed).toBeLessThan(added);
    f.host.dispose();
  });

  it("adopts a pending asset while hidden and reuses it on re-enable", async () => {
    const f = fixture();
    f.sync();
    f.hands.container.visible = false;
    f.sync();
    await settle();
    expect(f.host.ready).toBe(false);
    f.hands.container.visible = true;
    f.sync();
    expect(f.host.ready).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    f.host.dispose();
  });

  it("keeps the fallback after construction failure until source changes", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    const f = fixture();
    mocks.failed = true;
    f.sync();
    await settle();
    expect(f.host.ready).toBe(false);
    expect(mocks.fail).toHaveBeenCalledOnce();
    for (let i = 0; i < 20; i++) f.sync();
    f.host.clear();
    f.sync();
    await settle();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    mocks.failed = false;
    f.host.setAssetSource("/replacement/keyboard88-performer.json");
    f.sync();
    await settle();
    expect(f.host.ready).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    f.host.dispose();
    warning.mockRestore();
  });
});
