// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { findSongCourseSource } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import type { SongCourseResult as Result, SongCourseSource } from "../songCourse/model";
import { gradeSongCourseAttempt } from "../songCourse/rubric";
import { validSongCourseResult } from "../songCourse/progress";
import { SongCourseLesson, type SongCourseLessonProps } from "./SongCourseLesson";
import { SongCoursePath } from "./SongCoursePath";
import { SongCourseResult } from "./SongCourseResult";
import { WindowDisclosureContext } from "./windowDisclosureContext";
import { WindowViewMemory } from "./windowViewMemory";

vi.mock("../staff/Staff", () => ({ Staff: () => <div data-miniature-score /> }));
let host: HTMLDivElement, root: Root;
const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing fixture");
const source: SongCourseSource = { ...fixture, nodes: fixture.nodes.slice(0, 2) };
const first = source.nodes[0];
if (!first) throw new Error("missing node");
const nodeId = first.id;

function receipt(change: Partial<Result> = {}): Result {
  const material = buildSongCourseMaterial(source, nodeId);
  const speed = 0.75;
  const inputs = material.expected.flatMap((note, index) => {
    const start = (note.start * 1000) / speed;
    const held = index === material.expected.length - 1 ? 50 : (note.duration * 1000) / speed;
    return [
      {
        type: "down" as const,
        source: "midi",
        pitch: note.pitch,
        performanceMs: start,
        stableOrdinal: index * 3 + 1,
        songTime: note.start
      },
      {
        type: "up" as const,
        source: "midi",
        pitch: note.pitch,
        performanceMs: start + held,
        stableOrdinal: index * 3 + 2,
        songTime: note.start + (held * speed) / 1000
      }
    ];
  });
  const end = (material.song.duration * 1000) / speed;
  const result = gradeSongCourseAttempt(
    {
      runId: "ui-receipt",
      songId: source.id,
      sourceRevision: source.revision,
      sourceHash: source.sourceHash,
      nodeId,
      mode: "wait",
      speed,
      learnerPartIds: source.learnerPartIds,
      expected: material.expected
    },
    {
      inputs,
      presentations: material.expected.map((note, index) => ({
        sourceNoteId: note.sourceNoteId,
        performanceMs: (note.start * 1000) / speed,
        stableOrdinal: index * 3
      })),
      musicalEndPerformanceMs: end,
      closedAtPerformanceMs: end + 300,
      createdAt: 1
    }
  );
  return { ...result, ...change };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "show").mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement
  ) {
    this.removeAttribute("open");
  });
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(view: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(view);
  });
}
async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent.trim() === label
  );
  if (!button) throw new Error(`missing button ${label}`);
  await act(async () => {
    await Promise.resolve();
    button.click();
  });
}

describe("song-course path", () => {
  it("credits only completed normal results for the exact source hash and keeps selection explicit", async () => {
    const choose = vi.fn();
    const path = (results: readonly Result[]) => (
      <SongCoursePath sources={[source]} selection={null} results={results} onChoose={choose} />
    );
    await render(
      path([receipt({ sourceHash: "0".repeat(64) }), receipt({ rubricVariant: "learning-review" })])
    );
    expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(0);
    expect(host.querySelector("progress")?.value).toBe(0);
    expect(choose).not.toHaveBeenCalled();
    await click("Продолжить мелодию →");
    expect(choose).toHaveBeenCalledExactlyOnceWith(source.id, nodeId);
    const full = receipt();
    const subset = gradeSongCourseAttempt(
      {
        runId: "subset-proof",
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId,
        mode: "wait",
        speed: full.speed,
        learnerPartIds: source.learnerPartIds,
        expected: full.evidence.expected.slice(0, 2)
      },
      {
        ...full.evidence,
        inputs: full.evidence.inputs.filter((input) => input.stableOrdinal < 6),
        presentations: full.evidence.presentations.slice(0, 2),
        createdAt: 1
      }
    );
    expect(validSongCourseResult(subset)).toBe(true);
    expect(subset.completed).toBe(true);
    await render(path([subset]));
    expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(0);
    await render(path([full]));
    expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(1);
    expect(host.querySelector("progress")?.value).toBe(1);
    expect(host.querySelector('[aria-label="Звёзд за этап: 1 из 3"]')).not.toBeNull();
  });

  it("restores both opened and closed song groups after the window content unmounts", async () => {
    const second = findSongCourseSource("aunt-rhody");
    if (!second) throw new Error("missing second source");
    const memory = new WindowViewMemory();
    const view = (
      <WindowDisclosureContext value={memory}>
        <SongCoursePath
          sources={[source, { ...second, nodes: second.nodes.slice(0, 1) }]}
          selection={null}
          results={[]}
          onChoose={vi.fn()}
        />
      </WindowDisclosureContext>
    );
    await render(view);
    const groups = Array.from(
      host.querySelectorAll<HTMLDetailsElement>("details.song-course-path__group")
    );
    expect(groups.map((group) => group.open)).toEqual([true, false]);
    await act(async () => {
      await Promise.resolve();
      for (const group of groups) {
        group.open = !group.open;
        group.dispatchEvent(new Event("toggle"));
      }
    });
    memory.capture("body", host);
    await render(null);
    await render(view);
    expect(
      Array.from(
        host.querySelectorAll<HTMLDetailsElement>("details.song-course-path__group"),
        (group) => group.open
      )
    ).toEqual([false, true]);
    expect(host.querySelectorAll(".song-course-path__trail")).toHaveLength(1);
  });
});

describe("song-course lesson and result", () => {
  function lessonProps(): SongCourseLessonProps {
    return {
      material: buildSongCourseMaterial(fixture ?? source, nodeId),
      phase: "ready",
      progress: 0.25,
      result: null,
      error: null,
      storageError: false,
      hasNext: true,
      canReview: false,
      score: <div data-lesson-score />,
      speed: 0.75,
      onSpeed: vi.fn(),
      onStart: vi.fn(),
      onDemo: vi.fn(),
      onPause: vi.fn(),
      onRetry: vi.fn(),
      onNext: vi.fn(),
      onReview: vi.fn(),
      onExit: vi.fn(),
      onRetrySave: vi.fn()
    };
  }
  it("keeps the release and rehold instructions consistent", async () => {
    const props = lessonProps();
    for (const [phase, instruction] of [
      ["awaiting-keys-up", "Сначала отпустите клавиши"],
      ["awaiting-rehold", "Снова нажмите прежнюю ноту"],
      ["awaiting-release", "Завершаем звук — отпустите клавишу"]
    ] as const) {
      await render(<SongCourseLesson {...props} phase={phase} />);
      expect(host.querySelector(".song-course-lesson__hold-status")?.textContent).toBe(instruction);
      expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe(instruction);
    }
  });
  it("shows musical progress and permits speed selection only before a new attempt", async () => {
    const props = lessonProps();
    await render(<SongCourseLesson {...props} />);
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(host.textContent).not.toContain(props.material.node.instruction);
    expect(host.querySelector("[data-lesson-score]")).not.toBeNull();
    await click("···");
    expect(host.textContent).toContain(props.material.node.instruction);
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider?.min).toBe("0.25");
    expect(slider?.max).toBe("1");
    expect(slider?.value).toBe("0.75");
    expect(host.querySelector("progress")?.value).toBe(0.25);
    expect(host.textContent).toContain("Скорость этапа: 75%");
    await act(async () => {
      await Promise.resolve();
      if (!slider) throw new Error("missing slider");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        slider,
        "0.5"
      );
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onSpeed).toHaveBeenCalledExactlyOnceWith(0.5);
    await act(async () => {
      await Promise.resolve();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(host.querySelector(".song-course-menu")).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Подсказки и меню этапа");
    const play = host.querySelector<HTMLButtonElement>(".song-course-lesson__play");
    expect(play?.getAttribute("aria-label")).toBe("Сыграть этап");
    expect(host.querySelectorAll('button[aria-label="К пути по мелодиям"]')).toHaveLength(1);
    await act(async () => {
      await Promise.resolve();
      play?.click();
    });
    expect(props.onStart).toHaveBeenCalledOnce();
    for (const phase of ["playing", "paused", "awaiting-release", "demo"] as const) {
      await render(<SongCourseLesson {...props} phase={phase} waiting />);
      expect(host.querySelector('input[type="range"]')).toBeNull();
    }
    expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe("Слушай мелодию");
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>(".song-course-lesson__pause")?.click();
    });
    expect(props.onPause).toHaveBeenCalledOnce();
  });

  it("uses short readable teacher, learner and resume cues in both languages", async () => {
    const props = lessonProps();
    await render(<SongCourseLesson {...props} phase="ready" />);
    expect(host.querySelector(".song-course-start__cue")?.textContent).toBe("Слушаем Твили");
    await render(<SongCourseLesson {...props} phase="paused" />);
    expect(host.querySelector(".song-course-start__cue")?.textContent).toBe("Продолжаем");
    expect(host.querySelector(".song-course-lesson__play")?.getAttribute("title")).toBe(
      "Продолжаем"
    );
    await render(<SongCourseLesson {...props} phase="playing" countdown={3} />);
    expect(host.querySelector(".song-course-start__cue")?.textContent).toBe("Твоя очередь");
    setInterfaceLanguage("en");
    await render(<SongCourseLesson {...props} phase="ready" />);
    expect(host.querySelector(".song-course-start__cue")?.textContent).toBe("Listen to Twili");
    await render(<SongCourseLesson {...props} phase="paused" />);
    expect(host.querySelector(".song-course-lesson__play")?.getAttribute("title")).toBe("Continue");
    await render(<SongCourseLesson {...props} phase="playing" countdown={3} />);
    expect(host.querySelector(".song-course-start__cue")?.textContent).toBe("Your turn");
  });

  it("distinguishes the melody example from the accompanied learner turn", async () => {
    const props = lessonProps();
    await render(<SongCourseLesson {...props} phase="demo" accompaniment />);
    expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe("Слушай мелодию");
    await render(<SongCourseLesson {...props} phase="playing" accompaniment />);
    expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe(
      "Твоя очередь · с сопровождением"
    );
    await render(<SongCourseLesson {...props} phase="playing" accompaniment={false} />);
    expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe("Твоя очередь");
  });

  it("pauses for optional instructions, closes outside, and keeps settings behind the course menu", async () => {
    const props = lessonProps();
    const onSettings = vi.fn(),
      onLanguage = vi.fn(),
      onFullscreen = vi.fn();
    const view = (phase: SongCourseLessonProps["phase"]) => (
      <SongCourseLesson
        {...props}
        phase={phase}
        onSettings={onSettings}
        onLanguage={onLanguage}
        onFullscreen={onFullscreen}
      />
    );
    await render(view("playing"));
    await click("···");
    expect(props.onPause).toHaveBeenCalledOnce();
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(host.textContent).toContain(props.material.node.instruction);
    await click("Сменить язык урока");
    expect(onLanguage).toHaveBeenCalledOnce();
    await click("Настройки");
    expect(onSettings).toHaveBeenCalledOnce();
    expect(host.querySelector(".song-course-menu")).toBeNull();
    await render(view("ready"));
    await click("···");
    await click("На весь экран");
    expect(onFullscreen).toHaveBeenCalledOnce();
    await click("···");
    await act(async () => {
      await Promise.resolve();
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(host.querySelector(".song-course-menu")).toBeNull();
  });

  it("keeps short status and musical hold instructions localized without the long ready card", async () => {
    const props = lessonProps();
    setInterfaceLanguage("en");
    await render(
      <SongCourseLesson {...props} phase="awaiting-rehold" characters={<span data-character />} />
    );
    expect(host.querySelector(".song-course-lesson__status")?.textContent).toBe(
      "Press the same note again"
    );
    expect(host.querySelector("[data-character]")).not.toBeNull();
    expect(host.querySelector(".song-course-lesson__action button")).toBeNull();
    await click("···");
    expect(host.textContent).toContain("How to play this stage");
    expect(host.textContent).toContain("On phones and tablets");
  });

  it("shows separate pitch/onset/hold evidence, actual speed, earned stars and result callbacks", async () => {
    const next = vi.fn(),
      review = vi.fn(),
      retry = vi.fn(),
      exit = vi.fn(),
      save = vi.fn();
    await render(
      <SongCourseResult
        result={receipt()}
        hasNext
        canReview
        storageError
        onNext={next}
        onReview={review}
        onRetry={retry}
        onExit={exit}
        onRetrySave={save}
      />
    );
    expect(Array.from(host.querySelectorAll("dt"), (item) => item.textContent)).toEqual([
      "Правильные ноты",
      "Длина нажатия"
    ]);
    expect(Array.from(host.querySelectorAll("dd"), (item) => item.textContent)).toEqual([
      "100 процентов",
      "75 процентов"
    ]);
    expect(host.querySelectorAll('[data-earned="true"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("Скорость исполнения:");
    await click("К следующему этапу");
    await click("Разобрать трудные места");
    await click("Сыграть ещё раз");
    expect(host.querySelector(".song-course-result__rating")?.textContent).toBe(
      "Звёзд за этап: 1 из 3"
    );
    expect(host.querySelector(".song-course-result__actions")?.textContent).not.toContain(
      "К пути по мелодиям"
    );
    const close = host.querySelector<HTMLButtonElement>(".song-course-result__bar button");
    expect(close?.getAttribute("aria-label")).toBe("К пути по мелодиям");
    await act(async () => {
      await Promise.resolve();
      close?.click();
    });
    await click("Ещё раз сохранить результат");
    for (const callback of [next, review, retry, exit, save])
      expect(callback).toHaveBeenCalledOnce();
    await render(
      <SongCourseResult
        result={receipt({ valid: false, stars: 3 })}
        hasNext
        canReview={false}
        storageError={false}
        onNext={next}
        onReview={review}
        onRetry={retry}
        onExit={exit}
        onRetrySave={save}
      />
    );
    expect(host.querySelectorAll('[data-earned="true"]')).toHaveLength(0);
    expect(host.textContent).toContain("Попытка не завершена");
    expect(host.textContent).not.toContain("К следующему этапу");
  });
  it.each([0, 2, 3] as const)(
    "shows an explicit %s-star rating, including an honest zero",
    async (stars) => {
      const noop = vi.fn();
      await render(
        <SongCourseResult
          result={receipt({
            stars,
            completed: stars > 0,
            pitch: stars ? 100 : 57,
            hold: stars ? 100 : 0
          })}
          hasNext
          canReview
          storageError={false}
          onNext={noop}
          onReview={noop}
          onRetry={noop}
          onExit={noop}
          onRetrySave={noop}
        />
      );
      expect(host.querySelector(".song-course-result__rating")?.textContent).toBe(
        `Звёзд за этап: ${String(stars)} из 3`
      );
      expect(host.querySelectorAll('[data-earned="true"]')).toHaveLength(stars);
      expect(host.querySelectorAll('[data-earned="false"]')).toHaveLength(3 - stars);
      if (stars === 0) {
        expect(host.querySelector(".song-course-result__stars")?.textContent).not.toContain("★");
        expect(host.querySelector(".song-course-result__message")?.textContent).toContain(
          "Держите клавишу до конца ноты"
        );
        expect(host.querySelector(".song-course-result__actions")?.textContent).not.toContain(
          "К следующему этапу"
        );
      }
    }
  );
  it("keeps the first note exercise simple and grades rhythm only in tempo stages", async () => {
    const props = lessonProps();
    await render(
      <SongCourseLesson
        {...props}
        phase="result"
        result={receipt({ stars: 0, completed: false, hold: 0 })}
        canReview
      />
    );
    expect(host.querySelector("h2")?.textContent).toBe("Попробуем ещё раз");
    expect(host.textContent).not.toContain("Разобрать трудные места");
    expect(host.textContent).not.toContain("Попадание в ритм");
    expect(host.querySelectorAll(".song-course-result__actions button")).toHaveLength(1);
    const noop = vi.fn();
    await render(
      <SongCourseResult
        result={receipt({ mode: "tempo", onset: 80 })}
        hasNext
        canReview
        storageError={false}
        onNext={noop}
        onReview={noop}
        onRetry={noop}
        onExit={noop}
        onRetrySave={noop}
      />
    );
    expect(host.textContent).toContain("Попадание в ритм");
    expect(host.textContent).toContain("80 процентов");
    expect(host.textContent).toContain("Скорость исполнения: 75%");
  });
  it("shows the session count-in inside Play and removes the central control during play", async () => {
    const props = lessonProps();
    await render(<SongCourseLesson {...props} phase="playing" countdown={3} />);
    expect(host.querySelector(".song-course-lesson__play")?.textContent).toBe("3");
    expect(host.querySelector(".song-course-lesson__play")?.getAttribute("aria-label")).toBe(
      "До начала: 3"
    );
    await render(<SongCourseLesson {...props} phase="playing" />);
    expect(host.querySelector(".song-course-lesson__play")).toBeNull();
    expect(host.querySelector(".song-course-lesson__pause")).not.toBeNull();
    expect(host.querySelector(".song-course-lesson__action")?.textContent ?? "").toBe("");
  });
});

it("continues the selected melody before unfinished earlier songs", async () => {
  const twinkle = findSongCourseSource("twinkle");
  const node = twinkle?.nodes[0];
  if (!twinkle || !node) throw new Error("missing twinkle");
  const choose = vi.fn();
  await render(
    <SongCoursePath
      sources={[source, { ...twinkle, nodes: [node] }]}
      results={[]}
      selection={{
        songId: twinkle.id,
        sourceRevision: twinkle.revision,
        sourceHash: twinkle.sourceHash,
        nodeId: node.id
      }}
      onChoose={choose}
    />
  );
  expect(host.querySelector(".song-course-path__welcome h3")?.textContent).toBe("Звёздочка");
  await click("Продолжить мелодию →");
  expect(choose).toHaveBeenCalledExactlyOnceWith(twinkle.id, node.id);
});
