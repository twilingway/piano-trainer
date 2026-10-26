// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { BassReadingResult } from "../reading/bassTypes";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import {
  BassReadingCourseCard,
  BassReadingPracticePanel,
  type BassReadingPracticeProps
} from "./BassReadingCourse";
import { BassReadingResults } from "./BassReadingProgress";

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => {
    await Promise.resolve();
    button.click();
  });
}
async function reveal(id: string) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing lesson details: ${id}`);
  await act(async () => {
    await Promise.resolve();
    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
}
async function english() {
  await act(async () => {
    await Promise.resolve();
    setInterfaceLanguage("en");
  });
}
function fixture(task: "notes" | "phrases" = "notes"): BassReadingResult {
  const correct = {
    expectedMidi: 48,
    playedMidi: 48,
    exerciseId: "exercise",
    noteId: "n0",
    responseLatencyMs: 3000,
    hintLevel: 0 as const,
    inputSource: "pointer" as const,
    atMs: 3000
  };
  return {
    id: task,
    runId: task,
    startedAt: 0,
    completedAt: 1000,
    provenance: "native",
    newMaterial: false,
    plan: null,
    skillId: "bass-note-reading",
    task,
    seed: 1,
    generatorVersion: 1,
    exerciseId: "exercise",
    createdAt: 1000,
    notes: [
      {
        noteId: "n0",
        expectedMidi: 48,
        firstAttemptCorrect: false,
        independentCorrect: false,
        unassistedSolved: true,
        responseLatencyMs: 3000,
        hintLevel: 0,
        attempts: [
          { ...correct, playedMidi: 60, responseLatencyMs: 1000, inputSource: "midi", atMs: 1000 },
          correct
        ]
      }
    ]
  };
}
function panelProps(): BassReadingPracticeProps {
  return {
    task: "notes",
    preferences: DEFAULT_READING_PREFERENCES,
    onPreferences: noop,
    onHint: noop,
    hintLevel: 0,
    hintPitch: 48,
    index: 0,
    renderError: false,
    onRetry: noop,
    onNewSeries: noop,
    onExit: noop,
    result: null,
    history: [],
    ready: true
  };
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
  vi.unstubAllGlobals();
});

describe("bass reading UI", () => {
  it("offers both tasks and the introduction without prerequisites in RU and EN", async () => {
    const onStart = vi.fn();
    const onIntro = vi.fn();
    await render(<BassReadingCourseCard history={[]} onStart={onStart} onIntro={onIntro} />);
    expect(host.textContent).toContain("Левая рука: пять нот");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector(".lesson-primary-action")?.textContent).toBe(
      "Левая рука: отдельные ноты"
    );
    expect(host.querySelector(".lesson-secondary-action")).toBeNull();
    await reveal("bass-reading:catalog:more");
    expect(host.querySelector(".lesson-secondary-action")?.textContent).toBe(
      "Знакомство с левой рукой"
    );
    expect(host.querySelector(".reading-progress")).toBeNull();
    await click("Левая рука: отдельные ноты");
    await reveal("bass-reading:catalog:more");
    expect(onStart).toHaveBeenCalledExactlyOnceWith("notes");
    expect(onIntro).not.toHaveBeenCalled();
    await click("Левая рука: короткие фразы");
    await click("Знакомство с левой рукой");
    expect(onStart.mock.calls).toEqual([["notes"], ["phrases"]]);
    expect(onIntro).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("Повторить трудные ноты");
    await english();
    expect(host.textContent).toContain("Left hand: five notes");
    expect(host.textContent).toContain("Meet the left-hand position");
  });
  it("gates hints on presentation and reveals only the supplied current bass pitch", async () => {
    const onHint = vi.fn();
    const onRetry = vi.fn();
    const props = { ...panelProps(), onHint, onRetry };
    await render(<BassReadingPracticePanel {...props} ready={false} />);
    await click("Подсказка");
    expect(onHint).not.toHaveBeenCalled();
    expect(host.querySelector(".reading-hint")).toBeNull();
    await render(<BassReadingPracticePanel {...props} />);
    await click("Подсказка");
    expect(onHint).toHaveBeenCalledOnce();
    await render(
      <BassReadingPracticePanel {...props} task="phrases" hintLevel={1} hintPitch={52} />
    );
    expect(host.querySelector(".reading-hint")?.textContent).toBe("Текущая нота: ми 3");
    expect(host.textContent).not.toContain("Текущая нота: до 3");
    await render(<BassReadingPracticePanel {...props} renderError hintLevel={1} />);
    expect(host.querySelector(".reading-hint")).toBeNull();
    await click("Подсказка");
    expect(onHint).toHaveBeenCalledOnce();
    await click("Повторить загрузку стана");
    expect(onRetry).toHaveBeenCalledOnce();
    await render(<BassReadingPracticePanel {...props} hintLevel={2} />);
    await click("Подсказка");
    expect(onHint).toHaveBeenCalledOnce();
    await render(<BassReadingPracticePanel {...props} result={fixture()} />);
    expect(host.querySelector(".reading-results")?.closest("details")).toBeNull();
    await click("Подсказка");
    expect(onHint).toHaveBeenCalledOnce();
    await english();
    expect(host.textContent).toContain("Bass reading result");
  });
  it("keeps errors and unassisted solutions distinct while filtering by the final source", async () => {
    await render(<BassReadingResults result={fixture()} sourceFilter="pointer" />);
    const row = host.querySelector("tbody tr");
    expect([...(row?.querySelectorAll("td") ?? [])].map((item) => item.textContent)).toEqual([
      "до 3",
      "1",
      "1",
      "0",
      "1.0",
      "3.0",
      "—"
    ]);
    expect(host.textContent).toContain("Верно с первой попытки: 0/1");
    expect(host.textContent).toContain("Решено без подсказок: 1/1");
    expect(host.querySelector('[aria-label="Пока нет данных о времени ответа"]')).not.toBeNull();
    await render(<BassReadingResults result={fixture()} sourceFilter="midi" />);
    expect(host.textContent).toContain("Для выбранного способа ввода пока нет ответов.");
  });
  it("separates task histories, labels phrase timing and routes source preferences without starting a set", async () => {
    const onSourceFilter = vi.fn();
    const onNewSeries = vi.fn();
    const onExit = vi.fn();
    const onPreferences = vi.fn();
    await render(
      <BassReadingPracticePanel
        {...panelProps()}
        task="phrases"
        history={[fixture(), fixture("phrases")]}
        onSourceFilter={onSourceFilter}
        onNewSeries={onNewSeries}
        onExit={onExit}
        onPreferences={onPreferences}
      />
    );
    expect(host.querySelector(".reading-history")).toBeNull();
    await reveal("bass-reading:practice:progress");
    expect(onSourceFilter).not.toHaveBeenCalled();
    expect(onNewSeries).not.toHaveBeenCalled();
    expect(host.querySelector(".reading-history summary")?.textContent).toBe(
      "История этого задания: 1"
    );
    expect(host.querySelectorAll(".reading-history .reading-results")).toHaveLength(1);
    expect(host.textContent).toContain("задержка последовательного ответа на заранее видимые ноты");
    const groups = [...host.querySelectorAll(".reading-progress-group")];
    expect(groups).toHaveLength(2);
    expect(
      groups.map((group) => group.querySelector("tbody tr td:nth-child(2)")?.textContent)
    ).toEqual(["1", "1"]);
    const select = host.querySelector("select");
    if (!select) throw new Error("Missing source filter");
    await act(async () => {
      await Promise.resolve();
      select.value = "keyboard";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSourceFilter).toHaveBeenCalledWith("keyboard");
    expect(onNewSeries).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    await reveal("bass-reading:practice:settings");
    expect(onPreferences).not.toHaveBeenCalled();
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error("Missing hint preference");
    await act(async () => {
      await Promise.resolve();
      checkbox.click();
    });
    expect(onPreferences).toHaveBeenCalledWith({ automaticHints: false });
    await click("Новая серия");
    await click("Выйти из басового чтения");
    expect(onNewSeries).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
    await english();
    expect(host.textContent).toContain("sequential responses to notes already visible");
    expect(host.textContent).toContain("last 20 sets for each exercise");
  });
});
