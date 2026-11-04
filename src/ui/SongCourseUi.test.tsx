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
  it("shows musical progress and permits speed selection only before a new attempt", async () => {
    const props = lessonProps();
    await render(<SongCourseLesson {...props} />);
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
    await click("Сыграть этап");
    expect(props.onStart).toHaveBeenCalledOnce();
    for (const phase of ["playing", "paused", "awaiting-release", "demo"] as const) {
      await render(<SongCourseLesson {...props} phase={phase} waiting />);
      expect(host.querySelector('input[type="range"]')).toBeNull();
    }
    expect(host.querySelector(".lesson-workspace__waiting")?.textContent).toBe("");
    await click("Пауза в песне");
    expect(props.onPause).toHaveBeenCalledOnce();
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
      "Попадание в ритм",
      "Длина нажатия"
    ]);
    expect(Array.from(host.querySelectorAll("dd"), (item) => item.textContent)).toEqual([
      "100 процентов",
      "Время начала не оценивается",
      "75 процентов"
    ]);
    expect(host.querySelectorAll('[data-earned="true"]')).toHaveLength(1);
    expect(host.textContent).toContain("Скорость исполнения: 75%");
    await click("К следующему этапу");
    await click("Разобрать трудные места");
    await click("Сыграть этот этап ещё раз");
    await click("К пути по мелодиям");
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
