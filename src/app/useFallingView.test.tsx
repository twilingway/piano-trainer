// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import { FallingNotesView } from "../render/FallingNotesView";
import { CAMERA_PRESETS } from "../render/worldCamera";
import { USUAL_PLACEMENT } from "../render/viewGeometry";
import type { Song } from "../song/song";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "./staffPreferences";
import { useFallingView } from "./useFallingView";

vi.mock("../render/FallingNotesView", () => ({ FallingNotesView: vi.fn() }));

const view = {
  onHandStatus: undefined as ((status: "idle" | "loading" | "ready" | "error") => void) | undefined,
  flatEffects: { set: vi.fn() },
  setLocale: vi.fn(),
  setHudTop: vi.fn(),
  setFpsVisible: vi.fn(),
  setShowLabels: vi.fn(),
  setNoteNames: vi.fn(),
  setParts: vi.fn(),
  setRoad: vi.fn(),
  setNoteCards: vi.fn(),
  setFallingNoteStyle: vi.fn(),
  setFreeRoadLayout: vi.fn(),
  setKeyStyle: vi.fn(),
  setCamera: vi.fn(),
  setKeyboardTop: vi.fn(),
  setRoadShape: vi.fn(),
  setComputerKeys: vi.fn(),
  setKeysPlacement: vi.fn(),
  setRange: vi.fn(),
  setRoadGuides: vi.fn(),
  setKeyboardDim: vi.fn(),
  setFreeCamera: vi.fn(),
  setFreeCameraMovement: vi.fn(),
  setPerformanceScene: vi.fn(),
  hands: { setStyle: vi.fn() }
};
const trainer = { setPlaying: vi.fn(), load: vi.fn(), seek: vi.fn(), setComparison: vi.fn() };
const song: Song = {
  title: "test",
  source: "midi",
  notes: [],
  beats: [],
  measures: [],
  duration: 10
};
const viewRef = { current: view as unknown as FallingNotesView };
const trainerRef = { current: trainer as unknown as Trainer };
const hostRef = { current: null };
const updateStaffPrefs = vi.fn();
let host: HTMLDivElement;
let root: Root;

const comparisonTake = { take: { notes: [] }, review: { notes: [] } } as unknown as Parameters<
  typeof useFallingView
>[0]["lastTake"];
function Harness({
  prefs,
  comparing = false,
  blocked = false
}: {
  readonly prefs: StaffPrefs;
  readonly comparing?: boolean;
  readonly blocked?: boolean;
}) {
  const { handStatus, mirrorHostRef } = useFallingView({
    hostRef,
    hasScore: false,
    viewRef,
    trainerRef,
    trainerReady: true,
    song,
    baseSong: song,
    staffPrefs: prefs,
    cameraInputBlocked: blocked,
    updateStaffPrefs,
    fallingNames: undefined,
    comparing,
    lastTake: comparing ? comparisonTake : null,
    placement: USUAL_PLACEMENT
  });
  return (
    <>
      <output>{handStatus}</output>
      <div ref={mirrorHostRef} />
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("road guide view preference", () => {
  it("toggles guides without rebuilding the view or issuing song/playback commands", async () => {
    await act(async () => {
      root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
      await Promise.resolve();
    });
    expect(view.setRoadGuides).toHaveBeenCalledWith(false);
    vi.clearAllMocks();
    await act(async () => {
      root.render(<Harness prefs={{ ...DEFAULT_STAFF_PREFS, roadGuides: true }} />);
      await Promise.resolve();
    });
    expect(view.setRoadGuides).toHaveBeenCalledOnce();
    expect(view.setRoadGuides).toHaveBeenLastCalledWith(true);
    expect(view.setRoad).not.toHaveBeenCalled();
    expect(view.setKeyStyle).not.toHaveBeenCalled();
    expect(view.setRange).not.toHaveBeenCalled();
    expect(view.setCamera).not.toHaveBeenCalled();
    expect(view.setKeysPlacement).not.toHaveBeenCalled();
    expect(trainer.load).not.toHaveBeenCalled();
    expect(trainer.seek).not.toHaveBeenCalled();
    expect(trainer.setPlaying).not.toHaveBeenCalled();
    await act(async () => {
      root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
      await Promise.resolve();
    });
    expect(view.setRoadGuides).toHaveBeenLastCalledWith(false);
    expect(view.setRoad).not.toHaveBeenCalled();
  });
});

it("switches the keyboard camera independently without restarting playback", async () => {
  await act(async () => {
    await Promise.resolve();
    root.render(<Harness prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle: "3d" }} />);
  });
  vi.clearAllMocks();
  await act(async () => {
    await Promise.resolve();
    root.render(
      <Harness
        prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle: "3d", road: true, keyboardOrientation: "top" }}
      />
    );
  });
  expect(view.setKeyboardTop).toHaveBeenLastCalledWith(true);
  expect(trainer.load).not.toHaveBeenCalled();
  expect(trainer.seek).not.toHaveBeenCalled();
  expect(trainer.setPlaying).not.toHaveBeenCalled();
});
it("switches inspection independently without restarting playback or changing learning camera prefs", async () => {
  await act(async () => {
    root.render(<Harness prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle: "3d" }} />);
    await Promise.resolve();
  });
  vi.clearAllMocks();
  await act(async () => {
    root.render(<Harness prefs={{ ...DEFAULT_STAFF_PREFS, keyStyle: "3d", freeCamera: true }} />);
    await Promise.resolve();
  });
  expect(view.setFreeCamera).toHaveBeenLastCalledWith(true);
  expect(view.setKeyStyle).not.toHaveBeenCalled();
  expect(view.setCamera).not.toHaveBeenCalled();
  expect(trainer.load).not.toHaveBeenCalled();
  expect(trainer.seek).not.toHaveBeenCalled();
  expect(trainer.setPlaying).not.toHaveBeenCalled();
});

it("disables camera movement in menus without resetting camera, playback or the saved opt-in", async () => {
  const prefs = { ...DEFAULT_STAFF_PREFS, freeCamera: true, freeCameraWasd: true };
  await act(async () => {
    root.render(<Harness prefs={prefs} />);
    await Promise.resolve();
  });
  expect(view.setFreeCameraMovement).toHaveBeenLastCalledWith(true);
  vi.clearAllMocks();
  await act(async () => {
    root.render(<Harness prefs={prefs} blocked />);
    await Promise.resolve();
  });
  expect(view.setFreeCameraMovement).toHaveBeenLastCalledWith(false);
  expect(view.setCamera).not.toHaveBeenCalled();
  expect(trainer.load).not.toHaveBeenCalled();
  expect(trainer.seek).not.toHaveBeenCalled();
  expect(updateStaffPrefs).not.toHaveBeenCalled();
  await act(async () => {
    root.render(<Harness prefs={prefs} />);
    await Promise.resolve();
  });
  expect(view.setFreeCameraMovement).toHaveBeenLastCalledWith(true);
});

it("applies the selected world source profile without camera or transport resets", async () => {
  const direct = { height: 3, distance: 1, width: 8, shape: "convex" as const };
  const perspective = { height: 4, distance: 7, width: 12, shape: "concave" as const };
  const prefs = {
    ...DEFAULT_STAFF_PREFS,
    freeDirectField: direct,
    freePerspectiveField: perspective
  };
  await act(async () => {
    root.render(<Harness prefs={prefs} />);
    await Promise.resolve();
  });
  expect(view.setFreeRoadLayout).toHaveBeenLastCalledWith(direct);
  vi.clearAllMocks();
  const changed = { ...direct, height: 5 };
  await act(async () => {
    root.render(<Harness prefs={{ ...prefs, freeDirectField: changed }} />);
    await Promise.resolve();
  });
  expect(view.setFreeRoadLayout).toHaveBeenLastCalledWith(changed);
  expect(view.setCamera).not.toHaveBeenCalled();
  expect(trainer.load).not.toHaveBeenCalled();
  expect(trainer.seek).not.toHaveBeenCalled();
  await act(async () => {
    root.render(<Harness prefs={{ ...prefs, road: true }} />);
    await Promise.resolve();
  });
  expect(view.setFreeRoadLayout).toHaveBeenLastCalledWith(perspective);
});

it("changes flat effect preferences without reconfiguring the camera or playback", async () => {
  await act(async () => {
    root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
    await Promise.resolve();
  });
  expect(view.flatEffects.set).toHaveBeenLastCalledWith(true, true, true);
  vi.clearAllMocks();
  await act(async () => {
    root.render(
      <Harness
        prefs={{
          ...DEFAULT_STAFF_PREFS,
          flatNoteBurning: false,
          flatPressEffects: false,
          noteParticles: false
        }}
      />
    );
    await Promise.resolve();
  });
  expect(view.flatEffects.set).toHaveBeenCalledExactlyOnceWith(false, false, false);
  expect(view.setKeyStyle).not.toHaveBeenCalled();
  expect(view.setCamera).not.toHaveBeenCalled();
  expect(trainer.load).not.toHaveBeenCalled();
  expect(trainer.seek).not.toHaveBeenCalled();
  expect(trainer.setPlaying).not.toHaveBeenCalled();
});

it("applies the full initial top camera with follow orientation and hidden hands", async () => {
  await act(async () => {
    root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
    await Promise.resolve();
  });
  expect(view.setCamera).toHaveBeenCalledWith(CAMERA_PRESETS.top);
  expect(view.setKeyboardTop).toHaveBeenCalledWith(false);
  expect(view.setKeyStyle).toHaveBeenCalledWith("3d");
  expect(view.setParts).toHaveBeenCalledWith({ notes: true, keys: true, hands: false });
});

it("reports hand loading state without restarting the song and unsubscribes on unmount", async () => {
  await act(async () => {
    await Promise.resolve();
    root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
  });
  const callback = view.onHandStatus;
  expect(callback).toBeTypeOf("function");
  act(() => callback?.("error"));
  expect(host.querySelector("output")?.textContent).toBe("error");
  expect(trainer.load).not.toHaveBeenCalled();
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  expect(view.onHandStatus).toBeUndefined();
  root = createRoot(host);
});

it.each(["filled", "flat", "glass"] as const)(
  "applies %s note appearance without changing the clock or camera",
  async (fallingNoteStyle) => {
    await act(async () => {
      root.render(<Harness prefs={DEFAULT_STAFF_PREFS} />);
      await Promise.resolve();
    });
    expect(view.setFallingNoteStyle).toHaveBeenLastCalledWith("filled");
    vi.clearAllMocks();
    await act(async () => {
      root.render(<Harness prefs={{ ...DEFAULT_STAFF_PREFS, fallingNoteStyle }} />);
      await Promise.resolve();
    });
    if (fallingNoteStyle !== "filled")
      expect(view.setFallingNoteStyle).toHaveBeenLastCalledWith(fallingNoteStyle);
    expect(view.setCamera).not.toHaveBeenCalled();
    expect(view.setKeyStyle).not.toHaveBeenCalled();
    expect(trainer.load).not.toHaveBeenCalled();
    expect(trainer.seek).not.toHaveBeenCalled();
    expect(trainer.setPlaying).not.toHaveBeenCalled();
  }
);

it("applies note appearance to an existing comparison without remounting it", async () => {
  const mirror = {
    ...view,
    setFallingNoteStyle: vi.fn(),
    flatEffects: { set: vi.fn() },
    mount: vi.fn(async () => {
      await Promise.resolve();
    }),
    setSong: vi.fn(),
    destroy: vi.fn()
  };
  vi.mocked(FallingNotesView).mockImplementation(function () {
    return mirror as unknown as FallingNotesView;
  });
  await act(async () => {
    root.render(<Harness prefs={DEFAULT_STAFF_PREFS} comparing />);
    await Promise.resolve();
  });
  expect(mirror.setFallingNoteStyle).toHaveBeenLastCalledWith("filled");
  await act(async () => {
    root.render(
      <Harness prefs={{ ...DEFAULT_STAFF_PREFS, fallingNoteStyle: "glass" }} comparing />
    );
    await Promise.resolve();
  });
  expect(mirror.setFallingNoteStyle).toHaveBeenLastCalledWith("glass");
  expect(mirror.mount).toHaveBeenCalledOnce();
  expect(trainer.seek).not.toHaveBeenCalled();
  expect(trainer.load).not.toHaveBeenCalled();
});
