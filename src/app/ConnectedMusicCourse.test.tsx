// @vitest-environment happy-dom
import { act, createContext, useContext, type ReactNode } from "react";
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
import { useMusicCourse } from "./useMusicCourse";
import { createAppStore, type AppStore } from "./store";
import { createMemoryReadingRepository } from "./readingRepository";
import { withTestStore } from "./storeTestSupport";
import { ConnectedMusicCards, ConnectedMusicPractice } from "./ConnectedMusicCourse";

const RuntimeTestContext = createContext<PlayerRuntime | null>(null);
vi.mock("./PlayerRuntimeProvider", () => ({
  useRuntimeSelector: <Value,>(select: (runtime: PlayerRuntime) => Value) => {
    const runtime = useContext(RuntimeTestContext);
    if (!runtime) throw new Error("Missing test runtime");
    return select(runtime);
  }
}));
let host: HTMLDivElement, root: Root;
let store: AppStore;
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
    progressOpen: false,
    setProgressOpen: vi.fn(),
    courseFilter: "all",
    setCourseFilter: vi.fn(),
    purposeFilter: "all",
    setPurposeFilter: vi.fn(),
    command: vi.fn(),
    choose: vi.fn(),
    setPreferences: vi.fn(),
    open: vi.fn(),
    cancel: vi.fn(),
    refreshConnection: vi.fn()
  };
}
function RuntimeTestOwner({ children, value }: { children: ReactNode; value: MusicCourseHook }) {
  const owner = useMusicCourse();
  const runtime = {
    music: {
      ...value,
      progressOpen: owner.progressOpen,
      setProgressOpen: owner.setProgressOpen,
      courseFilter: owner.courseFilter,
      setCourseFilter: owner.setCourseFilter,
      purposeFilter: owner.purposeFilter,
      setPurposeFilter: owner.setPurposeFilter
    }
  } as unknown as PlayerRuntime;
  return <RuntimeTestContext.Provider value={runtime}>{children}</RuntimeTestContext.Provider>;
}
async function render(node: ReactNode, value: MusicCourseHook) {
  await act(async () => {
    await Promise.resolve();
    root.render(withTestStore(<RuntimeTestOwner value={value}>{node}</RuntimeTestOwner>, store));
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
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: createMemoryReadingRepository()
  });
  await store.readingPersistenceReady;
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
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
  it("keeps library-only presentation in its live hook owner across child unmounts without learning actions", async () => {
    const value = music(),
      close = vi.fn();
    const initial = store.getState();
    const dispatch = vi.spyOn(store, "dispatch");
    const claim = vi.spyOn(store, "claimReadingMaterial");
    await render(<ConnectedMusicCards onChoose={close} />, value);
    await click(button("Мой музыкальный прогресс"));
    await changeProgress(0, "harmony");
    await changeProgress(2, "control");
    await render(null, value);
    expect(host.querySelector(".music-course-progress")).toBeNull();
    await render(<ConnectedMusicCards onChoose={close} />, value);
    expect(host.querySelector(".music-course-progress")).not.toBeNull();
    expect(progressSelect(0).value).toBe("harmony");
    expect(progressSelect(2).value).toBe("control");
    await click(button("Мой музыкальный прогресс"));
    await render(null, value);
    await render(<ConnectedMusicCards onChoose={close} />, value);
    expect(host.querySelector(".music-course-progress")).toBeNull();
    await click(button("Мой музыкальный прогресс"));
    expect(progressSelect(0).value).toBe("harmony");
    expect(progressSelect(2).value).toBe("control");
    expect(store.getState()).toBe(initial);
    expect(dispatch).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(value.setPreferences).not.toHaveBeenCalled();
    expect(value.open).not.toHaveBeenCalled();
    expect(value.command).not.toHaveBeenCalled();
    expect(value.cancel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    dispatch.mockRestore();
    claim.mockRestore();
  });
  it("isolates progress visibility and filters between two live hook owners", async () => {
    const value = music();
    const renderOwners = async (open: boolean) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          withTestStore(
            <>
              <RuntimeTestOwner value={value}>
                <section data-owner="first">
                  {open && <ConnectedMusicCards onChoose={() => undefined} />}
                </section>
              </RuntimeTestOwner>
              <RuntimeTestOwner value={value}>
                <section data-owner="second">
                  {open && <ConnectedMusicCards onChoose={() => undefined} />}
                </section>
              </RuntimeTestOwner>
            </>,
            store
          )
        );
      });
    };
    await renderOwners(true);
    const first = host.querySelector("[data-owner=first]"),
      second = host.querySelector("[data-owner=second]");
    if (!first || !second) throw new Error("Missing music owners");
    const progressButton = [...first.querySelectorAll("button")].find(
      (node) => node.textContent === "Мой музыкальный прогресс"
    );
    if (!progressButton) throw new Error("Missing progress action");
    await click(progressButton);
    const filters = first.querySelectorAll("select");
    await act(async () => {
      await Promise.resolve();
      const course = filters[0],
        purpose = filters[2];
      if (!course || !purpose) throw new Error("Missing filters");
      course.value = "dictation";
      course.dispatchEvent(new Event("change", { bubbles: true }));
      purpose.value = "training";
      purpose.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await renderOwners(false);
    await renderOwners(true);
    expect(first.querySelectorAll("select")[0]?.value).toBe("dictation");
    expect(first.querySelectorAll("select")[2]?.value).toBe("training");
    expect(second.querySelector(".music-course-progress")).toBeNull();
    const secondProgress = [...second.querySelectorAll("button")].find(
      (node) => node.textContent === "Мой музыкальный прогресс"
    );
    if (!secondProgress) throw new Error("Missing second progress action");
    await click(secondProgress);
    expect(second.querySelectorAll("select")[0]?.value).toBe("all");
    expect(second.querySelectorAll("select")[2]?.value).toBe("all");
    expect(value.open).not.toHaveBeenCalled();
    expect(value.command).not.toHaveBeenCalled();
  });
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
