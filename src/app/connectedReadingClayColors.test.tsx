// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedPracticeWorkspace } from "./ConnectedPracticeWorkspace";
import { ConnectedBeginner } from "./ConnectedBeginner";
import { generateReadingExercise } from "../reading/generator";
import { generateBeginnerExercise } from "../beginner/generator";
import { claySourceNoteIds } from "../song/clayNotes";
const mock = vi.hoisted(() => ({ runtime: {}, workspace: vi.fn(), panel: vi.fn() }));
vi.mock("./PlayerRuntimeProvider", () => ({
  useRuntimeSelector: (select: (runtime: unknown) => unknown) => select(mock.runtime)
}));
vi.mock("./runtimeCommands", () => ({ useRuntimeCommand: () => vi.fn() }));
vi.mock("./ConnectedPlayback", () => ({
  ConnectedWorkspace: (props: unknown) => {
    mock.workspace(props);
    return null;
  },
  ConnectedGameBoard: () => null,
  ConnectedWordBoard: () => null,
  ConnectedWordTicker: () => null
}));
vi.mock("./ConnectedCourse", () => ({ ConnectedPianoTabs: () => null }));
vi.mock("./ConnectedLessonWorkspace", () => ({ ConnectedLessonWorkspace: () => null }));
vi.mock("./ConnectedReading", () => ({ ConnectedReadingPractice: () => null }));
vi.mock("./ConnectedBassReading", () => ({ ConnectedBassReadingPractice: () => null }));
vi.mock("./ConnectedTwoHand", () => ({ ConnectedTwoHandPractice: () => null }));
vi.mock("./ConnectedHeldBass", () => ({ ConnectedHeldBassPractice: () => null }));
vi.mock("./ConnectedIndependentRhythm", () => ({ ConnectedIndependentRhythmPractice: () => null }));
vi.mock("../ui/BeginnerCourse", () => ({
  BeginnerIntro: () => null,
  BeginnerPracticePanel: (props: unknown) => {
    mock.panel(props);
    return null;
  }
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});
function state(phase: "guided" | "independent", legacy = false, hintLevel = 0) {
  const selection = { stageId: "beginner-v1-right-2", phase, seed: 1 } as const;
  const exercise = legacy
    ? generateReadingExercise("phrases", 42)
    : generateBeginnerExercise(selection);
  return {
    beginner: { active: !legacy, intro: false, independent: phase === "independent", selection },
    displayPrefs: { noteColor: "#55ccff" },
    word: {},
    screen: {},
    score: {},
    takes: {},
    trainer: {},
    snapshot: {},
    view: {},
    course: { active: null, saved: {} },
    music: { active: false },
    rhythm: { active: false },
    independentRhythm: { active: false },
    heldBass: { active: false },
    twoHand: { active: false },
    intervals: { active: false },
    practiceActive: true,
    reading: {
      active: true,
      task: phase === "independent" ? "check" : "phrases",
      hintLevel,
      exercise,
      note: exercise.song.notes[4],
      snapshot: null
    }
  };
}
describe("connected reading clay hints", () => {
  it("grants beginner guided colours and character immediately, despite saved cyan and hint zero", () => {
    mock.runtime = state("guided");
    act(() => {
      root.render(<ConnectedPracticeWorkspace />);
    });
    expect(mock.workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ staffPitchColors: true })
    );
    act(() => {
      root.render(<ConnectedBeginner />);
    });
    expect(mock.panel).toHaveBeenLastCalledWith(expect.objectContaining({ helped: true }));
  });
  it("does not reveal a name or pitch colour in independent mode even with a stale positive hint", () => {
    const runtime = state("independent", false, 2);
    // Phase permission remains authoritative even if a prompt policy uses phrase task ids.
    runtime.reading.task = "phrases";
    mock.runtime = runtime;
    act(() => {
      root.render(<ConnectedPracticeWorkspace />);
    });
    expect(mock.workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ staffPitchColors: false, staffPitchColorNoteId: undefined })
    );
    act(() => {
      root.render(<ConnectedBeginner />);
    });
    expect(mock.panel).toHaveBeenLastCalledWith(expect.objectContaining({ helped: false }));
  });
  it("maps a legacy named hint to its source id, preserving the unassisted guard", () => {
    const runtime = state("guided", true, 1);
    const sourceId = claySourceNoteIds(runtime.reading.exercise.musicXml).get(
      runtime.reading.note?.sourceIndex ?? -1
    );
    expect(sourceId).toBeDefined();
    expect(sourceId).not.toBe(runtime.reading.note?.id);
    mock.runtime = runtime;
    act(() => {
      root.render(<ConnectedPracticeWorkspace />);
    });
    expect(mock.workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ staffPitchColors: false, staffPitchColorNoteId: sourceId })
    );
    runtime.reading.hintLevel = 0;
    act(() => {
      root.render(<ConnectedPracticeWorkspace />);
    });
    expect(mock.workspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ staffPitchColorNoteId: undefined })
    );
  });
});
