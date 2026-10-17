// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import type { FallingNotesView } from "../render/FallingNotesView";
import { USUAL_PLACEMENT } from "../render/viewGeometry";
import type { Song } from "../song/song";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "./staffPreferences";
import { useFallingView } from "./useFallingView";

vi.mock("../render/FallingNotesView", () => ({ FallingNotesView: vi.fn() }));

const view = {
  setLocale: vi.fn(),
  setFpsVisible: vi.fn(),
  setShowLabels: vi.fn(),
  setNoteNames: vi.fn(),
  setParts: vi.fn(),
  setRoad: vi.fn(),
  setNoteCards: vi.fn(),
  setKeyStyle: vi.fn(),
  setCamera: vi.fn(),
  setKeyboardTop: vi.fn(),
  setRoadShape: vi.fn(),
  setComputerKeys: vi.fn(),
  setKeysPlacement: vi.fn(),
  setRange: vi.fn(),
  setRoadGuides: vi.fn(),
  setKeyboardDim: vi.fn(),
  hands: { setStyle: vi.fn() }
};
const trainer = { setPlaying: vi.fn(), load: vi.fn(), seek: vi.fn() };
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

function Harness({ prefs }: { readonly prefs: StaffPrefs }) {
  useFallingView({
    hostRef,
    hasScore: false,
    viewRef,
    trainerRef,
    trainerReady: true,
    song,
    baseSong: song,
    staffPrefs: prefs,
    updateStaffPrefs,
    fallingNames: undefined,
    comparing: false,
    lastTake: null,
    placement: USUAL_PLACEMENT
  });
  return null;
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
