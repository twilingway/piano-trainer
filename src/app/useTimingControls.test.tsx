// @vitest-environment happy-dom
import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import type { MidiDevice } from "../input/midiInput";
import type { TimingSettings } from "../ui/TimingSettings";
import { createTrainerSnapshotSource } from "./trainerSnapshots";
import { useTimingControls } from "./useTimingControls";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
let store: AppStore;

const ui = vi.hoisted(() => ({ props: null as ComponentProps<typeof TimingSettings> | null }));
vi.mock("../ui/TimingSettings", () => ({
  TimingSettings: (props: ComponentProps<typeof TimingSettings>) => {
    ui.props = props;
    return null;
  }
}));
vi.mock("../audio/pianoSound", () => ({
  audioTime: () => 0,
  cancelScheduledSound: vi.fn(),
  scheduleSound: vi.fn(),
  soundClick: vi.fn()
}));
let root: Root;
let host: HTMLDivElement;
let source: ReturnType<typeof createTrainerSnapshotSource>;
let ref: { current: Trainer | null };
let fake: {
  configureTiming: ReturnType<typeof vi.fn>;
  setPlaying: ReturnType<typeof vi.fn>;
  onInput?: Trainer["onInput"];
};
const devices: readonly MidiDevice[] = [{ id: "piano", name: "Piano" }];
const ensureSound = () => Promise.resolve();
function Harness({
  ready,
  show = false,
  connected = devices,
  localInput = false
}: {
  ready: boolean;
  show?: boolean;
  connected?: readonly MidiDevice[];
  localInput?: boolean;
}) {
  const timing = useTimingControls({
    trainerRef: ref,
    trainerReady: ready,
    snapshotSource: source,
    devices: connected,
    deviceId: "piano",
    localInput,
    ensureSound
  });
  return show ? timing.settings : null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  store = createAppStore();
  ui.props = null;
  source = createTrainerSnapshotSource();
  ref = { current: null };
  fake = { configureTiming: vi.fn(), setPlaying: vi.fn() };
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(ready: boolean, show = false, connected = devices, localInput = false) {
  await act(async () => {
    await Promise.resolve();
    root.render(
      withTestStore(
        <StrictMode>
          <Harness ready={ready} show={show} connected={connected} localInput={localInput} />
        </StrictMode>,
        store
      )
    );
  });
}

describe("stable trainer timing wiring", () => {
  it("calibrates local rhythm by Space and pointer taps even with MIDI attached", async () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    ref.current = fake as unknown as Trainer;
    await mount(true, true, devices, true);
    expect(ui.props?.deviceId).toBe("keyboard");
    await act(async () => {
      ui.props?.onStart();
      await Promise.resolve();
    });
    expect(ui.props?.running).toBe(true);
    for (let index = 0; index < 28; index++) {
      now = 4300 + index * 600;
      act(() => {
        if (index % 2 === 0) {
          const event = new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true });
          Object.defineProperty(event, "timeStamp", { value: now });
          window.dispatchEvent(event);
        } else ui.props?.onTap?.(now);
      });
    }
    expect(
      store.getState().preferences.timing.profiles[JSON.stringify(["keyboard", "local"])]
    ).toMatchObject({ complete: true, inputOffsetMs: 0 });
    expect(ui.props?.running).toBe(false);
    expect(store.getState().reading.history).toHaveLength(0);
    expect(store.getState().reading.rhythm.history).toHaveLength(0);
  });
  it("applies timing once after async trainer readiness and does not reconfigure on shell updates", async () => {
    await mount(false);
    expect(fake.configureTiming).not.toHaveBeenCalled();
    ref.current = fake as unknown as Trainer;
    await mount(true);
    expect(fake.configureTiming).toHaveBeenCalledOnce();
    const intercept = fake.onInput;
    await mount(true, true);
    expect(fake.configureTiming).toHaveBeenCalledOnce();
    expect(fake.onInput).toBe(intercept);
    await act(async () => {
      await Promise.resolve();
      ui.props?.onOffsets({ audioOffsetMs: 85, manualOffsetMs: 20 });
    });
    expect(fake.configureTiming).toHaveBeenCalledTimes(2);
    expect(fake.configureTiming).toHaveBeenLastCalledWith(
      expect.objectContaining({ audioOffsetMs: 85, manualInputOffsetMs: 20 })
    );
    expect(fake.onInput).toBe(intercept);
    await act(async () => {
      await Promise.resolve();
      ui.props?.onTransport("ble");
    });
    expect(fake.configureTiming).toHaveBeenCalledTimes(3);
    await mount(true, true, []);
    expect(fake.configureTiming).toHaveBeenCalledTimes(4);
    expect(fake.onInput).not.toBe(intercept);
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    expect(fake.onInput).toBeUndefined();
    root = createRoot(host);
  });

  it("subscribes diagnostics only while the settings element is mounted", async () => {
    const subscribe = vi.spyOn(source, "subscribe");
    ref.current = fake as unknown as Trainer;
    await mount(true);
    expect(subscribe).not.toHaveBeenCalled();
    await mount(true, true);
    expect(subscribe).toHaveBeenCalled();
    await act(async () => {
      ui.props?.onStart();
      await Promise.resolve();
    });
    expect(fake.setPlaying).toHaveBeenLastCalledWith(false);
    expect(
      fake.onInput?.({
        type: "down",
        pitch: 60,
        velocity: 100,
        source: "keyboard",
        timestamp: 1,
        deviceId: "keyboard"
      })
    ).toBe(true);
    await mount(true, false);
    expect(fake.onInput).toBeDefined();
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    expect(fake.onInput).toBeUndefined();
    root = createRoot(host);
  });
});
