// @vitest-environment happy-dom
import { act, useReducer, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { songFromMusicXml } from "../song/musicxml";
import { CourseCards } from "./CourseCards";
import type { CourseCardModel } from "./CourseCards";
import { CourseLessonBar } from "./CourseLessonBar";
import { LibraryDialog } from "./LibraryDialog";
import { buildPianoTabs, PianoTabs } from "./PianoTabs";
import { ResultDialog } from "./ResultDialog";
import { ViewToggles } from "./ViewToggles";
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import {
  courseActions,
  courseReducer,
  initialCourseState,
  type CourseState
} from "../app/courseSlice";

vi.mock("./GameDialog", () => ({
  GameDialog: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));

const XML = `<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
<direction><sound tempo="60"/></direction>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff></note>
<note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note>
<note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note>
</measure></part></score-partwise>`;
const song = songFromMusicXml(XML, "Synthetic");
const noop = () => undefined;
let host: HTMLDivElement;
let root: Root;
async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}
async function click(selector: string) {
  await act(async () => {
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>(selector)?.click();
  });
}
beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  localStorage.removeItem("interface-language-v1");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("course cards and exercise controls", () => {
  it("offers the next exercise without starting it automatically", async () => {
    const onNext = vi.fn();
    await render(
      <ResultDialog
        open
        stats={undefined}
        canReview={false}
        onClose={noop}
        onAgain={noop}
        onReview={noop}
        onNext={onNext}
      />
    );
    expect(onNext).not.toHaveBeenCalled();
    const next = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Следующее задание"
    );
    expect(next).toBeDefined();
    await act(async () => {
      await Promise.resolve();
      next?.click();
    });
    expect(onNext).toHaveBeenCalledOnce();
    await render(
      <ResultDialog
        open
        stats={undefined}
        canReview={false}
        onClose={noop}
        onAgain={noop}
        onReview={noop}
      />
    );
    expect(host.textContent).not.toContain("Следующее задание");
  });
  it("shows ten unavailable cards, progress and localized controls", async () => {
    const lessons: CourseCardModel[] = Array.from({ length: 10 }, (_, index) => ({
      id: `lesson-${String(index)}`,
      number: index + 1,
      title: `Local ${String(index)}`,
      goal: "Разучите фразы по одной руке, затем соедините их.",
      ready: false,
      started: false,
      stages: ["right", "left", "both"].map((id) => ({
        id: id as "right" | "left" | "both",
        completed: false,
        done: 0,
        total: 0
      }))
    }));
    const onContinue = vi.fn();
    await render(<CourseCards lessons={lessons} onContinue={onContinue} onStage={noop} />);
    expect(host.querySelectorAll("article")).toHaveLength(10);
    expect(host.textContent).toContain("Пройдено уроков: 0 из 10");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(40);
    await click(".game-button");
    expect(onContinue).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Coming soon");
    expect(host.textContent).toContain("Learn each hand, then play them together.");
    expect(host.textContent).toContain("Local 0");
  });

  it("lets players choose ready stages freely and distinguishes start, continue and repeat", async () => {
    const onContinue = vi.fn();
    const onStage = vi.fn();
    const lessons: CourseCardModel[] = [false, true, true].map((started, index) => ({
      id: `l${String(index)}`,
      number: index + 1,
      title: "Local",
      goal: "Goal",
      ready: true,
      started,
      stages: [
        { id: "right", completed: index === 2, done: index === 2 ? 1 : 0, total: 1 },
        { id: "both", completed: index === 2, done: index === 2 ? 1 : 0, total: 1 }
      ]
    }));
    await render(<CourseCards lessons={lessons} onContinue={onContinue} onStage={onStage} />);
    expect([...host.querySelectorAll(".game-button")].map((button) => button.textContent)).toEqual([
      "Начать",
      "Продолжить",
      "Повторить"
    ]);
    expect(host.textContent).toContain("Пройдено уроков: 1 из 3");
    expect(host.textContent).toContain("Этапы: 2 из 2");
    await click("article:first-child .course-stages button:last-child");
    expect(onStage).toHaveBeenCalledWith("l0", "both");
    await click("article:nth-child(2) .game-button");
    expect(onContinue).toHaveBeenCalledWith("l1");
  });

  it("offers next and phrase commands without duplicating hands or view controls", async () => {
    const onNext = vi.fn();
    const onPhrase = vi.fn();
    await render(
      <CourseLessonBar
        title="Local"
        phrases={[
          { id: "a", completed: true },
          { id: "b", completed: false }
        ]}
        phraseId="a"
        completed
        onPhrase={onPhrase}
        onNext={onNext}
      />
    );
    expect(host.textContent).toContain("Фраза 1 из 2");
    expect(onNext).not.toHaveBeenCalled();
    expect(host.querySelectorAll("select")).toHaveLength(1);
    expect(host.querySelector(".course-stages")).toBeNull();
    expect(host.querySelector(".course-view-choice")).toBeNull();
    await act(async () => {
      await Promise.resolve();
      const select = host.querySelector<HTMLSelectElement>("select");
      if (select) {
        select.value = "b";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onPhrase).toHaveBeenCalledWith("b");
    await click(".game-button");
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows partial stage counts and disables every action for a locked ready lesson", async () => {
    const onContinue = vi.fn(),
      onStage = vi.fn();
    const lesson: CourseCardModel = {
      id: "locked",
      number: 2,
      title: "Local",
      goal: "Goal",
      ready: true,
      lockedBy: 1,
      started: true,
      stages: [
        { id: "right", completed: false, done: 1, total: 4 },
        { id: "left", completed: false, done: 0, total: 4 },
        { id: "both", completed: false, done: 1, total: 6 }
      ]
    };
    await render(<CourseCards lessons={[lesson]} onContinue={onContinue} onStage={onStage} />);
    expect(host.textContent).toContain("Правая1/4");
    expect(host.textContent).toContain("Левая0/4");
    expect(host.textContent).toContain("Обе1/6");
    expect(host.textContent).toContain("Пройдите финальную мелодию урока 1");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(4);
    await click(".game-button");
    await click(".course-stages button");
    expect(onContinue).not.toHaveBeenCalled();
    expect(onStage).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Right1/4");
    expect(host.textContent).toContain("Lesson locked");
    expect(host.textContent).toContain("Complete lesson 1's full melody");
  });

  it("explains repeat credit under the new holding policy in both languages", async () => {
    await render(<CourseCards lessons={[]} previousCredits onContinue={noop} onStage={noop} />);
    expect(host.textContent).toContain("Прежние зачёты нужно повторить: теперь требуется 75%");
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Repeat earlier passes: you now need 75%");
  });

  it("keeps old versions separate and does not build course content in a closed library", async () => {
    const read = vi.fn();
    function Content() {
      read();
      return <div>Course</div>;
    }
    const props = {
      onClose: noop,
      lessons: [{ id: "basic", title: "Basic", levels: [] }],
      previousLessons: [{ id: "old", title: "Old", levels: [{ id: "one", title: "One" }] }],
      course: <Content />,
      current: null,
      currentSource: null,
      onLesson: noop,
      onExportLesson: noop,
      mySongs: [],
      onMySong: noop,
      onDeleteMySong: noop,
      folder: undefined,
      foldersSupported: false,
      onFolderSong: noop,
      onChooseFolder: noop,
      onGrantFolder: noop,
      onForgetFolder: noop,
      onOpenFile: noop
    };
    await render(<LibraryDialog {...props} open={false} />);
    expect(read).not.toHaveBeenCalled();
    await render(<LibraryDialog {...props} open />);
    expect(read).toHaveBeenCalledOnce();
    expect([...host.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
      "Уроки",
      "Предыдущие версии"
    ]);
    expect(host.querySelectorAll(".song-grid")).toHaveLength(2);
  });
});

describe("course views in the main view menu", () => {
  it.each([
    ["Нотный стан", "Пианинные табы", "staff", "tabs"],
    ["Пианинные табы", "Нотный стан", "tabs", "staff"]
  ] as const)(
    "puts the first enabled %s reader above %s",
    async (first, second, top, remaining) => {
      function Menu() {
        const [state, dispatch] = useReducer(
          (previous: CourseState, action: ReturnType<typeof courseActions.viewChanged>) =>
            courseReducer(previous, action),
          { ...initialCourseState, view: "hidden" }
        );
        return (
          <div data-top-view={state.topView} data-view={state.view}>
            <ViewToggles
              prefs={DEFAULT_STAFF_PREFS}
              hasScore
              onChange={noop}
              courseScore={{
                view: state.view,
                onView: (view) => {
                  dispatch(courseActions.viewChanged(view));
                }
              }}
            />
          </div>
        );
      }
      await render(<Menu />);
      await click(`[aria-label="${first}"]`);
      await click(`[aria-label="${second}"]`);
      expect(host.querySelector("[data-top-view]")?.getAttribute("data-top-view")).toBe(top);
      expect(host.querySelector("[data-view]")?.getAttribute("data-view")).toBe("both");
      await click(`[aria-label="${first}"]`);
      await click(`[aria-label="${first}"]`);
      expect(host.querySelector("[data-top-view]")?.getAttribute("data-top-view")).toBe(remaining);
    }
  );

  it("independently opens and closes score representations without changing global staff preferences", async () => {
    const onChange = vi.fn();
    function Menu() {
      const [view, onView] = useState<"tabs" | "staff" | "both" | "hidden">("tabs");
      return (
        <ViewToggles
          prefs={DEFAULT_STAFF_PREFS}
          hasScore
          onChange={onChange}
          courseScore={{ view, onView }}
        />
      );
    }
    await render(<Menu />);
    const tabs = () => host.querySelector('[aria-label="Пианинные табы"]');
    const staff = () => host.querySelector('[aria-label="Нотный стан"]');
    expect(tabs()?.getAttribute("aria-pressed")).toBe("true");
    expect(staff()?.getAttribute("aria-pressed")).toBe("false");
    await click('[aria-label="Пианинные табы"]');
    expect(tabs()?.getAttribute("aria-pressed")).toBe("false");
    expect(staff()?.getAttribute("aria-pressed")).toBe("false");
    await click('[aria-label="Нотный стан"]');
    expect(staff()?.getAttribute("aria-pressed")).toBe("true");
    await click('[aria-label="Нотный стан"]');
    expect(staff()?.getAttribute("aria-pressed")).toBe("false");
    await click('[aria-label="Пианинные табы"]');
    await click('[aria-label="Нотный стан"]');
    expect(tabs()?.getAttribute("aria-pressed")).toBe("true");
    expect(staff()?.getAttribute("aria-pressed")).toBe("true");
    await click('[aria-label="Нотный стан"]');
    expect(tabs()?.getAttribute("aria-pressed")).toBe("true");
    expect(staff()?.getAttribute("aria-pressed")).toBe("false");
    await click('[aria-label="Нотный стан"]');
    await click('[aria-label="Пианинные табы"]');
    expect(tabs()?.getAttribute("aria-pressed")).toBe("false");
    expect(staff()?.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.querySelector('[aria-label="Piano tabs"]')?.getAttribute("title")).toBe(
      "Show tabs"
    );
  });

  it("keeps the ordinary staff toggle and disables course score controls without a score", async () => {
    const onChange = vi.fn(),
      onView = vi.fn();
    await render(<ViewToggles prefs={DEFAULT_STAFF_PREFS} hasScore onChange={onChange} />);
    expect(host.querySelector('[aria-label="Пианинные табы"]')).toBeNull();
    await click('[aria-label="Нотный стан"]');
    expect(onChange).toHaveBeenCalledWith({ visible: false });
    await render(
      <ViewToggles
        prefs={DEFAULT_STAFF_PREFS}
        hasScore={false}
        onChange={onChange}
        courseScore={{ view: "hidden", onView }}
      />
    );
    await click('[aria-label="Пианинные табы"]');
    await click('[aria-label="Нотный стан"]');
    expect(onView).not.toHaveBeenCalled();
  });
});

describe("piano tabs from the same MusicXML", () => {
  it("aligns both hands, chords, note durations and measure boundaries", () => {
    const model = buildPianoTabs(song);
    expect(model.boundaries).toEqual([0, 1, 2, 4]);
    const right = model.events.find((event) => event.hand === "right" && event.start === 0);
    const left = model.events.find((event) => event.hand === "left");
    expect(right?.firstColumn).toBe(left?.firstColumn);
    expect(right?.lastColumn).toBe(2);
    expect(left?.lastColumn).toBe(4);
    expect(left?.notes).toHaveLength(2);
    expect(model.measures.has(0)).toBe(true);
  });

  it("shows the written finger and updates the current position using only supplied time", async () => {
    await render(<PianoTabs song={song} time={0.2} stage="right" />);
    expect(host.querySelector('[aria-label="Таб E, палец 1"]')?.getAttribute("data-current")).toBe(
      "true"
    );
    expect(
      host.querySelector('.piano-tabs__column[data-current="true"]')?.getAttribute("data-beat")
    ).toBe("0");
    expect(host.querySelector('[data-hand="left"]')?.getAttribute("data-muted")).toBe("true");
    await render(<PianoTabs song={song} time={1.2} stage="both" />);
    expect(host.querySelector('[aria-label="Таб E, палец 1"]')?.getAttribute("data-current")).toBe(
      "false"
    );
    expect(host.querySelector('[aria-label="Таб G"][data-current="true"]')).not.toBeNull();
    expect(
      host.querySelector('.piano-tabs__column[data-current="true"]')?.getAttribute("data-beat")
    ).toBe("1");
  });

  it("moves a continuous cursor within a held note using supplied song time", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    await render(<PianoTabs song={song} time={0} stage="both" />);
    frame?.(0);
    const cursor = host.querySelector<HTMLElement>(".piano-tabs__cursor");
    expect(cursor?.style.transform).toBe("translateX(0px)");
    await render(<PianoTabs song={song} time={2.5} stage="both" />);
    frame?.(16);
    expect(cursor?.style.transform).toBe("translateX(170px)");
    await render(<PianoTabs song={song} time={3} stage="both" />);
    frame?.(32);
    expect(cursor?.style.transform).toBe("translateX(204px)");
  });
});
