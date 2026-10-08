// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { songFromMusicXml } from "../song/musicxml";
import { CourseCards } from "./CourseCards";
import type { CourseCardModel } from "./CourseCards";
import { CourseLessonBar } from "./CourseLessonBar";
import { LibraryDialog } from "./LibraryDialog";
import { buildPianoTabs, PianoTabs } from "./PianoTabs";

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
        completed: false
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
        { id: "right", completed: index === 2 },
        { id: "both", completed: index === 2 }
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

  it("offers next explicitly and emits view/phrase commands without advancing on completion", async () => {
    const onNext = vi.fn();
    const onView = vi.fn();
    const onPhrase = vi.fn();
    await render(
      <CourseLessonBar
        title="Local"
        stages={[
          { id: "right", completed: true },
          { id: "both", completed: false }
        ]}
        currentStage="right"
        phrases={[
          { id: "a", completed: true },
          { id: "b", completed: false }
        ]}
        phraseId="a"
        view="tabs"
        completed
        onStage={noop}
        onPhrase={onPhrase}
        onView={onView}
        onNext={onNext}
      />
    );
    expect(host.textContent).toContain("Фраза 1 из 2");
    expect(onNext).not.toHaveBeenCalled();
    await click(".course-view-choice button:last-child");
    expect(onView).toHaveBeenCalledWith("staff");
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

  it("scrolls a narrow viewport to keep the current column visible", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      return Number(this.getAttribute("data-beat") ?? 0) * 80;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    await render(<PianoTabs song={song} time={0} stage="both" />);
    expect(host.querySelector(".piano-tabs__scroll")?.scrollLeft).toBe(0);
    await render(<PianoTabs song={song} time={2.5} stage="both" />);
    expect(host.querySelector(".piano-tabs__scroll")?.scrollLeft).toBe(125);
  });
});
