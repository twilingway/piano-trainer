// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { addReadingResult, emptyReadingProfile } from "../reading/progress";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingHintLevel,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { ReadingCourseCard, ReadingPracticePanel, ReadingResults } from "./ReadingCourse";

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;

async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(node);
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  expect(found, `Missing button: ${text}`).toBeDefined();
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    await Promise.resolve();
    target.click();
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

function result(task: ReadingTask = "notes", id = "result"): ReadingResult {
  const pitches = [60, 62, 64, 65, 67];
  return {
    id,
    exerciseId: "exercise",
    task,
    seed: 1,
    createdAt: 1_000,
    notes: Array.from({ length: 20 }, (_, index) => {
      const pitch = pitches[index % pitches.length] ?? 60;
      const hintLevel: ReadingHintLevel = index === 1 ? 1 : 0;
      const responseLatencyMs = index === 1 ? 2_000 : 1_000;
      const correct = {
        exerciseId: "exercise",
        noteId: `note-${String(index)}`,
        expectedMidi: pitch,
        playedMidi: pitch,
        responseLatencyMs,
        hintLevel,
        inputSource: "pointer" as const,
        atMs: responseLatencyMs
      };
      return {
        noteId: correct.noteId,
        expectedMidi: pitch,
        firstAttemptCorrect: index !== 0,
        independentCorrect: index > 1,
        unassistedSolved: index !== 1,
        responseLatencyMs,
        hintLevel,
        attempts: index === 0 ? [{ ...correct, playedMidi: 62, atMs: 500 }, correct] : [correct]
      };
    })
  };
}

function panelProps(): ComponentProps<typeof ReadingPracticePanel> {
  return {
    task: "notes",
    preferences: DEFAULT_READING_PREFERENCES,
    onPreferences: noop,
    onHint: noop,
    hintLevel: 0,
    hintPitch: 60,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reading course UI", () => {
  it("does not label an old check as new material", async () => {
    const check = result("check");
    await render(<ReadingResults result={{ ...check, provenance: "legacy" }} />);
    expect(host.textContent).toContain("Новизна этой серии не подтверждена.");
    await render(<ReadingResults result={{ ...check, provenance: "native", newMaterial: true }} />);
    expect(host.textContent).toContain("Новый порядок в пределах последних 256 показанных серий.");
    await english();
    expect(host.textContent).toContain("A new order compared with the last 256 sets shown.");
  });

  it("keeps generation recovery visible and routes source selection for the next adaptive practice", async () => {
    const onAdaptive = vi.fn();
    const onDelayedCheck = vi.fn();
    const onSourceFilter = vi.fn();
    const onGenerationRetry = vi.fn();
    const onNewSeries = vi.fn();
    await render(
      <ReadingPracticePanel
        {...panelProps()}
        purpose="adaptive"
        onAdaptive={onAdaptive}
        onDelayedCheck={onDelayedCheck}
        onSourceFilter={onSourceFilter}
        onGenerationRetry={onGenerationRetry}
        onNewSeries={onNewSeries}
        sourceFilter="all"
        delayedDue
        generationError
      />
    );
    expect(host.querySelector("strong")?.textContent).toBe("Повторяю трудные ноты");
    expect(host.querySelector('[role="alert"]')?.closest("details")).toBeNull();
    await click(button("Повторить поиск серии"));
    expect(host.querySelector(".reading-progress")).toBeNull();
    await reveal("reading:practice:progress");
    await click(button("Повторить трудные ноты"));
    await click(button("Проверить чтение спустя время"));
    expect(onAdaptive).toHaveBeenCalledOnce();
    expect(onDelayedCheck).toHaveBeenCalledOnce();
    expect(onGenerationRetry).toHaveBeenCalledOnce();
    const select = host.querySelector("select");
    if (!select) throw new Error("Missing reading source filter");
    await act(async () => {
      await Promise.resolve();
      select.value = "keyboard";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSourceFilter).toHaveBeenCalledWith("keyboard");
    expect(host.textContent).toContain("Способ ввода для сводки и следующей тренировки");
    expect(onNewSeries).not.toHaveBeenCalled();
    expect(host.textContent).toContain("256 показанных серий");
    await english();
    expect(button("Repeat difficult notes").disabled).toBe(false);
    expect(host.textContent).toContain("after a break");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("new note order");
    expect(host.textContent).toContain("Speed thresholds and review intervals are provisional");
  });

  it("shows separate purpose groups from the retained profile even without detailed history", async () => {
    const profile = addReadingResult(
      addReadingResult(emptyReadingProfile(), result("notes", "notes")),
      result("phrases", "phrases")
    );
    await render(
      <ReadingCourseCard onStart={noop} onIntro={noop} history={[]} profile={profile} />
    );
    expect(host.textContent).toContain("Завершено серий: 2");
    expect(host.querySelector("table")).toBeNull();
    await reveal("reading:catalog:progress");
    const groups = [...host.querySelectorAll(".reading-progress-group")];
    expect(groups).toHaveLength(5);
    expect(groups[0]?.querySelector("h4")?.textContent).toBe("Читаю отдельные ноты");
    expect(groups[0]?.textContent).toContain("Наблюдений: 20");
    expect(groups[1]?.querySelector("h4")?.textContent).toBe("Читаю короткие фразы");
    expect(groups[1]?.textContent).toContain("Наблюдений: 20");
    expect(groups[2]?.textContent).toContain("Наблюдений: 0");
    await english();
    expect(groups[0]?.querySelector("h4")?.textContent).toBe("Read single notes");
    expect(host.textContent).toContain("Median first key press, s");
    expect(host.textContent).toContain("Median solution time, s");
  });

  it("keeps earlier MIDI errors when filtering a final keyboard answer and shows missing independent time", async () => {
    const base = result();
    const first = base.notes[0];
    if (!first) throw new Error("Missing note fixture");
    const mixed: ReadingResult = {
      ...base,
      notes: [
        {
          ...first,
          responseLatencyMs: 3000,
          attempts: first.attempts.map((attempt, index) => ({
            ...attempt,
            inputSource: index === 0 ? "midi" : "keyboard",
            responseLatencyMs: index === 0 ? 1000 : 3000
          }))
        }
      ]
    };
    await render(<ReadingResults result={mixed} sourceFilter="keyboard" />);
    const row = host.querySelector("tbody tr");
    expect([...(row?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent)).toEqual([
      "до 4",
      "1",
      "1",
      "0",
      "1.0",
      "3.0",
      "—"
    ]);
    expect(row?.querySelector('[aria-label="Пока нет данных о времени ответа"]')?.textContent).toBe(
      "—"
    );
    expect(host.textContent).toContain("Самостоятельно с первой попытки: 0%");
    expect(host.textContent).toContain("Решено без подсказок: 1/1");
    await english();
    expect(row?.querySelector('[aria-label="No response time data yet"]')?.textContent).toBe("—");
    await render(<ReadingResults result={mixed} sourceFilter="midi" />);
    expect(host.textContent).toContain("No answers for the selected input method yet.");
    expect(host.querySelector("tbody tr td:nth-child(2)")?.textContent).toBe("0");
  });

  it("keeps the primary task and introduction visible while mounting other modes only on request", async () => {
    const onStart = vi.fn();
    const onIntro = vi.fn();
    await render(<ReadingCourseCard onStart={onStart} onIntro={onIntro} history={[]} />);
    expect(host.textContent).toContain("Правая рука: пять нот");
    expect(host.textContent).toContain("Завершено серий: 0");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector(".lesson-primary-action")?.textContent).toBe("Читаю отдельные ноты");
    expect(host.querySelector(".lesson-secondary-action")).toBeNull();
    await reveal("reading:catalog:more");
    expect(host.querySelector(".lesson-secondary-action")?.textContent).toBe(
      "Знакомство с пятью нотами"
    );
    expect(host.querySelector(".reading-progress")).toBeNull();
    await click(button("Читаю отдельные ноты"));
    await reveal("reading:catalog:more");
    expect(onStart).toHaveBeenCalledExactlyOnceWith("notes");
    expect(onIntro).not.toHaveBeenCalled();
    for (const label of ["Читаю короткие фразы", "Проверяю чтение без подсказок"]) {
      await click(button(label));
    }
    expect(onStart.mock.calls).toEqual([["notes"], ["phrases"], ["check"]]);
    await click(button("Знакомство с пятью нотами"));
    expect(onIntro).toHaveBeenCalledOnce();
    await english();
    expect(host.textContent).toContain("Right hand: five notes");
    expect(button("Check reading without hints").disabled).toBe(false);
  });

  it("gates the manual hint on presentation and reveals only the supplied current note", async () => {
    const props = { ...panelProps(), onHint: vi.fn() };
    await render(<ReadingPracticePanel {...props} ready={false} />);
    await click(button("Подсказка"));
    expect(props.onHint).not.toHaveBeenCalled();
    expect(host.querySelector(".reading-hint")).toBeNull();
    await render(<ReadingPracticePanel {...props} ready />);
    await click(button("Подсказка"));
    expect(props.onHint).toHaveBeenCalledOnce();
    await render(<ReadingPracticePanel {...props} hintLevel={1} hintPitch={64} />);
    expect(host.querySelector(".reading-hint")?.textContent).toBe("Текущая нота: ми 4");
    expect(host.textContent).not.toContain("Текущая нота: до 4");
    await render(<ReadingPracticePanel {...props} hintLevel={2} />);
    expect(button("Подсказка").disabled).toBe(true);
    await render(<ReadingPracticePanel {...props} result={result()} />);
    expect(button("Подсказка").disabled).toBe(true);
  });

  it("offers automatic hint preferences in learning and prevents all answer hints in the check", async () => {
    const onPreferences = vi.fn();
    const props = { ...panelProps(), onPreferences };
    await render(<ReadingPracticePanel {...props} />);
    expect(host.querySelector("input")).toBeNull();
    await reveal("reading:practice:settings");
    expect(onPreferences).not.toHaveBeenCalled();
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.checked).toBe(true);
    const delays = [...host.querySelectorAll<HTMLInputElement>('input[type="number"]')];
    expect(delays.map((input) => input.value)).toEqual(["5", "10"]);
    expect(delays.map((input) => [input.min, input.max])).toEqual([
      ["1", "60"],
      ["5", "60"]
    ]);
    if (!checkbox) throw new Error("Missing automatic hint preference");
    await click(checkbox);
    expect(onPreferences).toHaveBeenCalledWith({ automaticHints: false });
    await render(<ReadingPracticePanel {...props} task="check" hintLevel={2} hintPitch={67} />);
    expect(host.querySelector(".reading-hint")).toBeNull();
    expect(host.querySelector(".reading-hint-settings")).toBeNull();
    expect(
      [...host.querySelectorAll("button")].some((item) => item.textContent === "Подсказка")
    ).toBe(false);
    await english();
    expect(host.textContent).toContain("Check reading without hints");
    expect(host.getElementsByTagName("input")).toHaveLength(0);
  });

  it("keeps first tries, independent answers and unassisted solutions separate and filters history", async () => {
    await render(
      <ReadingPracticePanel
        {...panelProps()}
        result={result()}
        history={[result("notes", "prior-notes"), result("check", "prior-check")]}
      />
    );
    const current = host.querySelector(".reading-results");
    expect(current?.closest("details")).toBeNull();
    expect(host.querySelector(".reading-history")).toBeNull();
    expect(current?.textContent).toContain("Верно с первой попытки: 19/20");
    expect(current?.textContent).toContain("Самостоятельно с первой попытки: 90%");
    expect(current?.textContent).toContain("Решено без подсказок: 19/20");
    const rows = [...(current?.querySelectorAll("tbody tr") ?? [])];
    expect([...(rows[0]?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent)).toEqual([
      "до 4",
      "4",
      "1",
      "75",
      "1.0",
      "1.0",
      "1.0"
    ]);
    expect([...(rows[1]?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent)).toEqual([
      "ре 4",
      "4",
      "0",
      "75",
      "1.0",
      "1.0",
      "1.0"
    ]);
    await reveal("reading:practice:progress");
    expect(host.querySelector(".reading-history summary")?.textContent).toBe(
      "История этого задания: 1"
    );
    expect(host.querySelectorAll(".reading-history .reading-results")).toHaveLength(1);
    await english();
    expect(host.textContent).toContain("Correct on first try: 19/20");
    expect(host.textContent).toContain("Unassisted first tries: 90%");
    expect(host.textContent).toContain("Solved without hints: 19/20");
    expect(host.querySelector(".reading-history summary")?.textContent).toBe(
      "History for this exercise: 1"
    );
  });

  it("offers a retry for staff rendering failures without granting a hint", async () => {
    const onRetry = vi.fn();
    await render(
      <ReadingPracticePanel {...panelProps()} ready={false} renderError onRetry={onRetry} />
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Не удалось показать ноты."
    );
    expect(button("Подсказка").disabled).toBe(true);
    await click(button("Повторить загрузку стана"));
    expect(onRetry).toHaveBeenCalledOnce();
    await english();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not display the notes."
    );
    expect(button("Reload staff").disabled).toBe(false);
  });
});
