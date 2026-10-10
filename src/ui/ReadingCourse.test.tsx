// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import {
  DEFAULT_READING_PREFERENCES,
  type ReadingHintLevel,
  type ReadingResult,
  type ReadingTask
} from "../reading/types";
import { ReadingCourseCard, ReadingIntro, ReadingPracticePanel } from "./ReadingCourse";

vi.mock("./GameDialog", () => ({
  GameDialog: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));

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
  it("offers all three tasks immediately, even without completed sets", async () => {
    const onStart = vi.fn();
    const onIntro = vi.fn();
    await render(<ReadingCourseCard onStart={onStart} onIntro={onIntro} history={[]} />);
    expect(host.textContent).toContain("Читаю пять нот");
    expect(host.textContent).toContain("Завершено серий: 0");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(0);
    for (const label of [
      "Читаю отдельные ноты",
      "Читаю короткие фразы",
      "Проверяю чтение без подсказок"
    ]) {
      await click(button(label));
    }
    expect(onStart.mock.calls).toEqual([["notes"], ["phrases"], ["check"]]);
    await click(button("Знакомство с пятью нотами"));
    expect(onIntro).toHaveBeenCalledOnce();
    await english();
    expect(host.textContent).toContain("Read five notes");
    expect(button("Check reading without hints").disabled).toBe(false);
  });

  it("explains the five-key right-hand position and alternative input in both languages", async () => {
    await render(<ReadingIntro onClose={noop} />);
    expect(
      [...host.querySelectorAll(".reading-intro-keys strong")].map((key) => key.textContent)
    ).toEqual(["до 4", "ре 4", "ми 4", "фа 4", "соль 4"]);
    expect(host.textContent).toContain("Палец правой руки: 5");
    expect(host.textContent).toContain("MIDI не определяет, каким пальцем вы играете.");
    expect(host.textContent).toContain("нажимать клавиши мышью");
    await english();
    expect(
      [...host.querySelectorAll(".reading-intro-keys strong")].map((key) => key.textContent)
    ).toEqual(["C 4", "D 4", "E 4", "F 4", "G 4"]);
    expect(host.textContent).toContain("Right-hand finger: 5");
    expect(host.textContent).toContain("MIDI cannot tell which finger you use.");
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
    expect(current?.textContent).toContain("Верно с первой попытки: 19/20");
    expect(current?.textContent).toContain("Самостоятельно с первой попытки: 90%");
    expect(current?.textContent).toContain("Решено без подсказок: 19/20");
    const rows = [...(current?.querySelectorAll("tbody tr") ?? [])];
    expect([...(rows[0]?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent)).toEqual([
      "до 4",
      "1",
      "3/4",
      "1.0"
    ]);
    expect([...(rows[1]?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent)).toEqual([
      "ре 4",
      "0",
      "3/4",
      "1.3"
    ]);
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
