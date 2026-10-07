// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerRuntimeProvider, type PlayerRuntime } from "./PlayerRuntimeProvider";
import { ConnectedPlayerHeader } from "./ConnectedPlayerHeader";
import { ConnectedPlayerWindows } from "./ConnectedPlayerWindows";
import { ConnectedNotices } from "./ConnectedPlayerNotices";
import { createAppStore } from "./store";
const observed = vi.hoisted(() => ({
  header: vi.fn(),
  settings: vi.fn(),
  result: vi.fn(),
  library: vi.fn(),
  runtime: {} as PlayerRuntime
}));
vi.mock("./usePlayerRuntime", () => ({ usePlayerRuntime: () => observed.runtime }));
vi.mock("./useI18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("./ConnectedSettings", () => ({
  ConnectedPlayerSettings: observed.settings,
  ConnectedResultDialog: observed.result
}));
vi.mock("./ConnectedPlayback", () => ({
  ConnectedPlayerTopBar: observed.header,
  ConnectedSongProgress: () => null
}));
vi.mock("../ui/GameModeSwitch", () => ({ GameModeSegment: () => null }));
vi.mock("../ui/WordTextPopover", () => ({ WordTextPopover: () => null }));
vi.mock("../ui/WordTypingBoard", () => ({ WordQuality: () => null }));
vi.mock("../ui/LibraryDialog", () => ({ LibraryDialog: observed.library }));
const initial = (): PlayerRuntime =>
  ({
    libraryOpen: false,
    settingsOpen: false,
    resultClosed: false,
    listening: false,
    comparing: false,
    snapshot: { finished: false },
    trainer: { snapshotSource: {}, mode: "wait", speed: 1, playChoice: { hands: "both" } },
    takes: { canReview: false },
    fullscreen: { error: null, active: false },
    word: { storageError: null, enabled: false, pending: false, practiceSong: { title: "A" } },
    song: { title: "A" },
    current: {
      lesson: null,
      arrangement: {
        simplified: true,
        asWritten: true,
        onSimplified: vi.fn(),
        onAsWritten: vi.fn()
      }
    },
    screen: { editing: false },
    input: {},
    playing: false,
    sound: "idle",
    play: vi.fn(),
    game: { ranked: false },
    timing: { rankedReady: true },
    library: { loadError: null },
    setLibraryOpen: vi.fn(),
    setSettingsOpen: vi.fn(),
    setResultClosed: vi.fn(),
    computerKeyboard: { endEditing: vi.fn() },
    startOver: vi.fn()
  }) as unknown as PlayerRuntime;
let cleanup = () => undefined;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(children: React.ReactNode) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const store = createAppStore({ storage: { getItem: () => null, setItem: vi.fn() } });
  const render = () => {
    act(() => {
      root.render(
        <Provider store={store}>
          <PlayerRuntimeProvider>{children}</PlayerRuntimeProvider>
        </Provider>
      );
    });
  };
  cleanup = () => {
    act(() => {
      root.unmount();
    });
  };
  render();
  return { container, render };
}
describe("connected regions without React Compiler", () => {
  it("does not render closed windows or subscribe to their catalog after unrelated owner updates", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedPlayerWindows />);
    const renders = observed.settings.mock.calls.length;
    observed.runtime = {
      ...observed.runtime,
      library: { ...observed.runtime.library, mySongs: [] },
      trainer: { ...observed.runtime.trainer, speed: 2 },
      takes: { ...observed.runtime.takes }
    };
    view.render();
    expect(observed.settings.mock.calls.length).toBe(renders);
    expect(observed.library).not.toHaveBeenCalled();
    observed.runtime = { ...observed.runtime, settingsOpen: true };
    view.render();
    expect(observed.settings.mock.calls.length).toBe(renders + 1);
  });
  it("keeps the header stable across fresh command objects and invokes the latest committed play command", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedPlayerHeader />);
    const renders = observed.header.mock.calls.length;
    const play = vi.fn();
    observed.runtime = {
      ...observed.runtime,
      play,
      snapshot: { ...observed.runtime.snapshot, waiting: true },
      current: {
        ...observed.runtime.current,
        arrangement: {
          simplified: true,
          asWritten: true,
          onSimplified: vi.fn(),
          onAsWritten: vi.fn()
        }
      },
      trainer: {
        ...observed.runtime.trainer,
        playChoice: { ...observed.runtime.trainer.playChoice, onHands: vi.fn() }
      }
    };
    view.render();
    expect(observed.header.mock.calls.length).toBe(renders);
    const props = observed.header.mock.lastCall?.[0] as { onTogglePlay: () => void };
    props.onTogglePlay();
    expect(play).toHaveBeenCalledOnce();
    observed.runtime = { ...observed.runtime, playing: true };
    view.render();
    expect(observed.header.mock.calls.length).toBe(renders + 1);
  });
  it("updates notices only for displayed error fields", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedNotices />);
    expect(view.container.textContent).toBe("");
    observed.runtime = {
      ...observed.runtime,
      word: { ...observed.runtime.word, pending: true },
      library: { ...observed.runtime.library, loadError: "failure" }
    };
    view.render();
    expect(view.container.textContent).toBe("failure");
    observed.runtime = {
      ...observed.runtime,
      library: { ...observed.runtime.library, loadError: null }
    };
    view.render();
    expect(view.container.textContent).toBe("");
  });
});
