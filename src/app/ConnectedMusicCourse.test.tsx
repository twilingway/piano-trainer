// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retargetMusicResultFixture } from "../musicLearning/progressFixture";
import { validateMusicResult } from "../musicLearning/progressValidation";
import { computeHarmonyMetrics } from "../musicLearning/progress";
import { musicResultFixture } from "../musicLearning/progressFixture";
import { copyMusicResult } from "../musicLearning/progress";
import { createIntegratedPlan, IntegratedLesson } from "../musicLearning/integrated";
import { setInterfaceLanguage } from "./interfaceLanguage";
import { emptyMusicState } from "./musicPersistence";
import type { PlayerRuntime } from "./PlayerRuntimeProvider";
import type { MusicCourseHook } from "./useMusicCourse";
import { ConnectedMusicCards, ConnectedMusicPractice } from "./ConnectedMusicCourse";

const state = vi.hoisted(() => ({ runtime: null as PlayerRuntime | null }));
vi.mock("./PlayerRuntimeProvider", () => ({
  useRuntimeSelector: <Value,>(select: (runtime: PlayerRuntime) => Value) => {
    if (!state.runtime) throw new Error("Missing test runtime");
    return select(state.runtime);
  }
}));
let host: HTMLDivElement, root: Root;
function music(): MusicCourseHook {
  const saved = emptyMusicState();
  return {
    active: false,
    scene: null,
    exercise: null,
    ready: false,
    source: "keyboard",
    view: {
      course: "sight-reading",
      status: "ready",
      taskKind: "group",
      ready: true,
      allReleased: true,
      canStart: true,
      canListen: false,
      canFinish: false,
      canNext: false,
      canHelp: true,
      showHelp: false,
      canAnswer: true
    },
    options: undefined,
    staffXml: undefined,
    staffVisible: false,
    fingeringVisible: false,
    keysVisible: true,
    policy: null,
    presentation: undefined,
    retry: 0,
    preferences: saved,
    history: [],
    integrated: null,
    command: vi.fn(),
    choose: vi.fn(),
    setPreferences: vi.fn(),
    open: vi.fn(),
    cancel: vi.fn(),
    refreshConnection: vi.fn()
  };
}
async function render(node: ReactNode, value: MusicCourseHook) {
  state.runtime = { music: value } as unknown as PlayerRuntime;
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}
async function click(node: HTMLElement) {
  await act(async () => {
    await Promise.resolve();
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
function button(text: string): HTMLButtonElement {
  const node = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!node) throw new Error(`Missing button: ${text}`);
  return node;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  state.runtime = null;
});

function progressSelect(index: number): HTMLSelectElement {
  const select = host.querySelectorAll<HTMLSelectElement>(".music-progress-filters select")[index];
  if (!select) throw new Error("Missing progress filter");
  return select;
}
async function changeProgress(index: number, value: string) {
  await act(async () => {
    await Promise.resolve();
    const select = progressSelect(index);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
describe("connected music catalog and practice", () => {
  it("counts each course independently, opens the chosen course, and closes the library", async () => {
    const value = music();
    const close = vi.fn();
    const history = [
      musicResultFixture("sight-reading", "reading-1"),
      musicResultFixture("dictation", "dictation-1"),
      musicResultFixture("dictation", "dictation-2")
    ].map(copyMusicResult);
    await render(<ConnectedMusicCards onChoose={close} />, { ...value, history });
    const cards = host.querySelectorAll("section");
    expect(cards).toHaveLength(4);
    expect(cards[0]?.textContent).toContain("Завершено музыкальных занятий: 1");
    expect(cards[1]?.textContent).toContain("Завершено музыкальных занятий: 0");
    expect(cards[2]?.textContent).toContain("Завершено музыкальных занятий: 2");
    const openDictation = cards[2]?.querySelector("button");
    if (!openDictation) throw new Error("Missing dictation entry");
    await click(openDictation);
    expect(value.open).toHaveBeenCalledExactlyOnceWith("dictation");
    expect(close).toHaveBeenCalledOnce();
  });
  it("offers continue only for an unfinished saved mini-lesson", async () => {
    const plan = createIntegratedPlan({ seed: 77 });
    const lesson = new IntegratedLesson({ lessonId: "lesson-77", plan });
    const saved = lesson.save();
    const value: MusicCourseHook = {
      ...music(),
      integrated: {
        plan: { seed: 77, version: 1, theme: "c-major", bpm: plan.bpm },
        state: { ...saved, completedPhases: [], results: [], activitySeeds: {} }
      }
    };
    await render(<ConnectedMusicCards onChoose={() => undefined} />, value);
    expect(
      [...host.querySelectorAll("button")].filter(
        (node) => node.textContent === "Продолжить музыкальный курс"
      )
    ).toHaveLength(1);
    await click(button("Продолжить музыкальный курс"));
    expect(value.open).toHaveBeenCalledWith("integrated");
  });
  it("renders no active practice before selection and routes commands and provenance after selection", async () => {
    const value = music();
    await render(<ConnectedMusicPractice />, value);
    expect(host.textContent).toBe("");
    await render(<ConnectedMusicPractice />, { ...value, active: true });
    await click(button("Начать музыкальное задание"));
    expect(value.command).toHaveBeenCalledWith("start");
    await click(button("Поступенное движение"));
    expect(value.choose).toHaveBeenCalledWith("scalar", "keyboard");
    expect(host.querySelectorAll("canvas, svg")).toHaveLength(0);
  });
});

describe("connected persisted music progress", () => {
  it.each(["sight-reading", "dictation"] as const)(
    "shows persisted %s reference and reply notes without reopening the course",
    async (course) => {
      const saved = copyMusicResult(musicResultFixture(course, "saved-notes"));
      if (saved.course !== "sight-reading" && saved.course !== "dictation")
        throw new Error("Unexpected fixture course");
      const value = { ...music(), history: [saved] };
      const onChoose = vi.fn();
      await render(<ConnectedMusicCards onChoose={onChoose} />, value);
      await click(button("Мой музыкальный прогресс"));
      const row = host.querySelector('[data-run="saved-notes"]');
      expect(row?.querySelectorAll('[data-notes="expected"] li')).toHaveLength(
        saved.expectedNotes.length
      );
      expect(row?.querySelectorAll('[data-notes="played"] li')).toHaveLength(
        saved.course === "sight-reading" ? saved.playedNotes.length : saved.result.notes.length
      );
      expect(value.open).not.toHaveBeenCalled();
      expect(value.command).not.toHaveBeenCalled();
      expect(onChoose).not.toHaveBeenCalled();
    }
  );
  it("keeps the last saved result available after leaving practice, without selecting a course", async () => {
    const value = {
      ...music(),
      history: [
        copyMusicResult(musicResultFixture("harmony", "last-saved", Date.UTC(2026, 9, 26, 10)))
      ]
    };
    const onChoose = vi.fn();
    await render(<ConnectedMusicCards onChoose={onChoose} />, value);
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelector('[data-run="last-saved"]')).not.toBeNull();
    expect(host.textContent).toContain("Ответов на задания");
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelector(".music-course-progress")).toBeNull();
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelector('[data-run="last-saved"]')).not.toBeNull();
    expect(value.open).not.toHaveBeenCalled();
    expect(value.command).not.toHaveBeenCalled();
    expect(value.cancel).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("My music progress");
    expect(host.textContent).toContain("Correct answers");
  });
  it("changes real cohorts/history by persisted source, course and purpose filters", async () => {
    const reading = musicResultFixture("sight-reading", "reading-keyboard");
    const midi = retargetMusicResultFixture(reading, "reading-midi-control", "midi", "control");
    const visual = musicResultFixture("harmony", "harmony-visual");
    if (visual.course !== "harmony") throw new Error("Missing harmony fixture");
    const answers = [{ kind: "named" as const, expected: "major", answer: "major" }];
    const aural = {
      ...visual,
      id: "result:harmony-aural",
      runId: "harmony-aural",
      mode: "name-chord" as const,
      aural: true,
      answers,
      metrics: computeHarmonyMetrics(answers)
    };
    const value = {
      ...music(),
      active: true,
      history: [reading, midi, visual, aural].map(copyMusicResult)
    };
    await render(<ConnectedMusicCards onChoose={() => undefined} />, value);
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelectorAll('[data-cohort^="harmony:"]')).toHaveLength(2);
    await changeProgress(1, "midi");
    expect(value.setPreferences).toHaveBeenCalledExactlyOnceWith({ sourceFilter: "midi" });
    await render(<ConnectedMusicCards onChoose={() => undefined} />, {
      ...value,
      preferences: { ...value.preferences, sourceFilter: "midi" }
    });
    expect(host.querySelectorAll("[data-cohort]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-run]")).toHaveLength(1);
    expect(host.querySelector('[data-run="reading-midi-control"]')).not.toBeNull();
    await changeProgress(2, "training");
    expect(host.querySelectorAll("[data-run]")).toHaveLength(0);
    await changeProgress(2, "control");
    await changeProgress(0, "harmony");
    expect(host.querySelectorAll("[data-run]")).toHaveLength(0);
    expect(value.open).not.toHaveBeenCalled();
    expect(value.command).not.toHaveBeenCalled();
    expect(value.cancel).not.toHaveBeenCalled();
  });
  it("keeps saved P8 child results visible before the final parent history entry and deduplicates them later", async () => {
    const parent = copyMusicResult(musicResultFixture("integrated", "staged-mini"));
    if (parent.course !== "integrated") throw new Error("Missing P8 fixture");
    const value = { ...music(), integrated: { plan: parent.plan, state: parent.state } };
    await render(<ConnectedMusicCards onChoose={() => undefined} />, value);
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelectorAll("[data-run]")).toHaveLength(0);
    expect(host.querySelectorAll(".music-progress-pending [data-child]")).toHaveLength(
      parent.state.results.length
    );
    expect(host.querySelector(".music-progress-pending")?.textContent).toContain(
      "Дата этого задания не записана"
    );
    const cohorts = [...host.querySelectorAll("[data-cohort]")].map((node) => node.textContent);
    await render(<ConnectedMusicCards onChoose={() => undefined} />, {
      ...value,
      history: [parent]
    });
    expect(host.querySelectorAll("[data-run]")).toHaveLength(1);
    expect(host.querySelector(".music-progress-pending")).toBeNull();
    expect([...host.querySelectorAll("[data-cohort]")].map((node) => node.textContent)).toEqual(
      cohorts
    );
  });
  it("shows at most twenty latest rows and derives P8 cohorts from their own child sources", async () => {
    const history = Array.from({ length: 23 }, (_, index) =>
      copyMusicResult(musicResultFixture("sight-reading", `recent-${String(index)}`, 10000 + index))
    );
    const value = { ...music(), history };
    await render(<ConnectedMusicCards onChoose={() => undefined} />, value);
    await click(button("Мой музыкальный прогресс"));
    expect(host.querySelectorAll("[data-run]")).toHaveLength(20);
    expect(host.querySelector("[data-run]")?.getAttribute("data-run")).toBe("recent-22");
    const parent = copyMusicResult(musicResultFixture("integrated", "mini-owned"));
    if (parent.course !== "integrated") throw new Error("Missing mini-lesson result");
    const child = parent.state.results[0];
    if (!child) throw new Error("Missing mini-lesson child");
    expect(
      validateMusicResult(parent),
      "base mini-lesson fixture must remain valid"
    ).not.toBeNull();
    child.source = "pointer";
    expect(
      validateMusicResult(parent),
      "mixed-source mini-lesson must remain valid"
    ).not.toBeNull();
    await render(<ConnectedMusicCards onChoose={() => undefined} />, {
      ...music(),
      history: [parent],
      preferences: { ...value.preferences, sourceFilter: "pointer" }
    });
    expect(host.querySelectorAll("[data-cohort]")).toHaveLength(1);
    expect(host.querySelector("[data-cohort]")?.getAttribute("data-cohort")).toContain(
      "integrated:keyboard:pointer:"
    );
    expect(host.querySelectorAll("[data-child]")).toHaveLength(1);
    expect(host.querySelector("[data-child]")?.textContent).toContain("Поиск клавиш");
    expect(host.querySelectorAll('[data-cohort^="sight-reading:"]')).toHaveLength(0);
  });
});
