// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { createAppStore, type AppStore } from "../app/store";
import { withTestStore } from "../app/storeTestSupport";
import { generateIntervalExercise } from "../intervals/generator";
import { IntervalSession } from "../intervals/session";
import type { IntervalMode, IntervalResult } from "../intervals/types";
import {
  IntervalCourseCard,
  IntervalPracticePanel,
  type IntervalPracticeProps
} from "./IntervalCourse";
import { IntervalProgress, IntervalResults } from "./IntervalProgress";

let host: HTMLDivElement;
let root: Root;
let store: AppStore;
const noop = () => undefined;

async function render(node: ReactNode) {
  await act(async () => {
    await Promise.resolve();
    root.render(withTestStore(node, store));
  });
}

async function reveal(id: string) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing disclosure: ${id}`);
  await act(async () => {
    await Promise.resolve();
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(target: HTMLElement, detail = 0) {
  await act(async () => {
    await Promise.resolve();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
  });
}

async function english() {
  await act(async () => {
    await Promise.resolve();
    setInterfaceLanguage("en");
  });
}

function props(): IntervalPracticeProps {
  return {
    mode: "hear-and-choose",
    index: 0,
    ready: true,
    completed: false,
    listening: false,
    paused: false,
    error: false,
    renderError: false,
    helpShown: false,
    fullListeningCount: 1,
    partialListeningCount: 0,
    errorCount: 0,
    pair: { anchorMidi: 60, targetMidi: 64, category: "third-up" },
    onAnswer: noop,
    onListen: noop,
    onPause: noop,
    onHelp: noop,
    onRetry: noop,
    onStart: noop,
    onNewSeries: noop,
    onExit: noop
  };
}

function completedRun(mode: IntervalMode, helped = false): IntervalResult {
  const exercise = generateIntervalExercise(mode, 42);
  const session = new IntervalSession(exercise, { runId: mode, startedAt: 1 });
  session.setActive(true, 0);
  let at = 0;
  for (const pair of exercise.pairs) {
    const identity = session.identity();
    if (!identity) throw new Error("Missing question identity");
    if (mode === "see-and-play") {
      session.present(identity, at++);
      if (helped) session.showHelp(identity, at++);
      session.answerPitch(identity, 1, "midi", at++);
      session.answerPitch(identity, pair.anchorMidi, "keyboard", at++);
      session.answerPitch(identity, pair.targetMidi, "pointer", at++);
    } else {
      session.listeningStarted(identity, 1, at++);
      session.listeningCompleted(identity, 1, at++);
      if (helped) session.showHelp(identity, at++);
      session.answerCategory(identity, pair.category, "pointer", at++);
    }
  }
  const result = session.result(mode, 1000);
  if (!result) throw new Error("Missing completed run");
  return result;
}

beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  store = createAppStore();
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

describe("optional interval modes", () => {
  it("offers one primary mode and reveals the alternative without changing commands", async () => {
    const onStart = vi.fn();
    await render(<IntervalCourseCard onStart={onStart} />);
    expect(host.querySelector("h3")?.textContent).toBe("Интервалы");
    expect(host.querySelectorAll("button:disabled")).toHaveLength(0);
    await click(button("Вижу и играю пару"));
    expect(host.querySelectorAll("button")).toHaveLength(1);
    await reveal("interval:catalog:more");
    await click(button("Слышу и выбираю интервал"));
    expect(onStart.mock.calls).toEqual([["see-and-play"], ["hear-and-choose"]]);
    await english();
    expect(button("See and play a pair").disabled).toBe(false);
    expect(button("Hear and choose an interval").disabled).toBe(false);
    expect(host.textContent).toContain("Hear and play the distance between two notes.");
  });

  it("keeps switch, new series and exit available during playback", async () => {
    const current = { ...props(), onStart: vi.fn(), onNewSeries: vi.fn(), onExit: vi.fn() };
    await render(<IntervalPracticePanel {...current} ready={false} listening />);
    await reveal("interval:practice:more");
    await click(button("Вижу и играю пару"));
    await click(button("Новая серия"));
    await click(button("Выйти"));
    expect(current.onStart).toHaveBeenCalledWith("see-and-play");
    expect(current.onNewSeries).toHaveBeenCalledOnce();
    expect(current.onExit).toHaveBeenCalledOnce();
    await render(<IntervalPracticePanel {...current} mode="see-and-play" />);
    await click(button("Слышу и выбираю интервал"));
    expect(current.onStart).toHaveBeenLastCalledWith("hear-and-choose");
  });
});

describe("native category responses and manual help", () => {
  it("opens general guidance without showing the answer or changing a question", async () => {
    const current = {
      ...props(),
      onHelp: vi.fn(),
      onHelpPresented: vi.fn(),
      onStart: vi.fn(),
      onNewSeries: vi.fn()
    };
    await render(<IntervalPracticePanel {...current} />);
    expect(host.textContent).not.toContain("Первая — опора");
    await reveal("interval:practice:guide");
    expect(host.textContent).toContain("Первая — опора");
    expect(host.querySelector(".reading-hint")).toBeNull();
    expect(button("Терция вверх").disabled).toBe(false);
    expect(host.textContent).toContain("Пара 1 из 10");
    expect(current.onHelp).not.toHaveBeenCalled();
    expect(current.onHelpPresented).not.toHaveBeenCalled();
    expect(current.onStart).not.toHaveBeenCalled();
    expect(current.onNewSeries).not.toHaveBeenCalled();
  });
  it("keeps the current interval result outside lazy history", async () => {
    const result = completedRun("hear-and-choose");
    await render(
      <IntervalProgress
        history={[result]}
        result={result}
        mode="hear-and-choose"
        source="all"
        onSource={vi.fn()}
      />
    );
    expect(host.querySelectorAll(".reading-results")).toHaveLength(1);
    expect(host.querySelector('[data-window-detail="interval-reading:history"]')).toBeNull();
    await reveal("interval:practice:progress");
    expect(host.querySelector('[data-window-detail="interval-reading:history"]')).not.toBeNull();
    expect(host.querySelector('[data-window-detail="interval-reading:progress"]')).not.toBeNull();
    expect(host.querySelectorAll(".reading-results").length).toBeGreaterThan(1);
  });
  it("acknowledges only a mounted help answer and cancels its pending frame on removal", async () => {
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    const shown = vi.fn();
    await render(<IntervalPracticePanel {...props()} helpShown onHelpPresented={shown} />);
    expect(host.querySelector(".reading-hint")).not.toBeNull();
    expect(shown).not.toHaveBeenCalled();
    await render(<IntervalPracticePanel {...props()} onHelpPresented={shown} />);
    expect(frames.size).toBe(0);
    expect(shown).not.toHaveBeenCalled();
    await render(<IntervalPracticePanel {...props()} helpShown onHelpPresented={shown} />);
    act(() => {
      for (const callback of frames.values()) callback(1000);
    });
    expect(shown).toHaveBeenCalledOnce();
  });
  it.each([
    { ready: false, listening: false, paused: false, completed: false },
    { ready: false, listening: true, paused: false, completed: false },
    { ready: true, listening: true, paused: false, completed: false },
    { ready: true, listening: false, paused: true, completed: false },
    { ready: true, listening: false, paused: false, completed: true }
  ])("blocks choice and help in unavailable state %j", async (state) => {
    const onAnswer = vi.fn();
    const onHelp = vi.fn();
    await render(
      <IntervalPracticePanel {...props()} {...state} onAnswer={onAnswer} onHelp={onHelp} />
    );
    const group = host.querySelector('[role="group"][aria-label="Выбор интервала"]');
    const choices = [...(group?.querySelectorAll("button") ?? [])];
    expect(choices).toHaveLength(5);
    expect(choices.every((choice) => choice.disabled)).toBe(true);
    expect(button("Показать ответ").disabled).toBe(true);
    await click(choices[0] ?? button("Повтор ноты"), 1);
    await click(button("Показать ответ"));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("opens all five native choices after a full pair and reports correct activation sources", async () => {
    const onAnswer = vi.fn();
    const current = { ...props(), onAnswer };
    await render(<IntervalPracticePanel {...current} />);
    const choices = [...(host.querySelector('[role="group"]')?.querySelectorAll("button") ?? [])];
    expect(choices).toHaveLength(5);
    expect(
      choices.every(
        (choice) => !choice.disabled && choice.type === "button" && choice.tabIndex === 0
      )
    ).toBe(true);
    await click(button("Шаг вверх"), 1);
    await render(<IntervalPracticePanel {...current} errorCount={1} />);
    expect(host.textContent).toContain("Пара 1 из 10");
    expect(host.textContent).toContain("Ошибок в текущей паре: 1");
    await click(button("Терция вверх"), 0);
    expect(onAnswer.mock.calls).toEqual([
      ["step-up", "pointer"],
      ["third-up", "keyboard"]
    ]);
    await english();
    expect(host.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe(
      "Choose an interval"
    );
    expect(host.textContent).toContain("Mistakes in this pair: 1");
    await click(button("Third down"), 1);
    expect(onAnswer).toHaveBeenLastCalledWith("third-down", "pointer");
  });

  it("hides exact pitches before actual help, then reveals only the current pair", async () => {
    const onHelp = vi.fn();
    await render(<IntervalPracticePanel {...props()} onHelp={onHelp} />);
    expect(host.querySelector(".reading-hint")).toBeNull();
    expect(host.textContent).not.toContain("до 4");
    expect(host.textContent).not.toContain("ми 4");
    await click(button("Показать ответ"));
    expect(onHelp).toHaveBeenCalledOnce();
    expect(host.querySelector(".reading-hint")).toBeNull();
    await render(<IntervalPracticePanel {...props()} helpShown />);
    expect(host.querySelector(".reading-hint")?.textContent).toBe(
      "Ответ пары: до 4 → ми 4, Терция вверх."
    );
    expect(button("Показать ответ").disabled).toBe(true);
    await english();
    expect(host.querySelector(".reading-hint")?.textContent).toBe(
      "Pair answer: C 4 → E 4, Third up."
    );
    expect(button("Show the answer").disabled).toBe(true);
  });

  it("separates listening/replay and pause actions from answer-help commands", async () => {
    const current = { ...props(), onListen: vi.fn(), onPause: vi.fn(), onHelp: vi.fn() };
    await render(<IntervalPracticePanel {...current} ready={false} fullListeningCount={0} />);
    await click(button("Послушать пару"), 1);
    await click(button("Пауза интервалов"), 1);
    expect(current.onListen).toHaveBeenCalledOnce();
    expect(current.onPause).toHaveBeenCalledOnce();
    expect(current.onHelp).not.toHaveBeenCalled();
    await render(<IntervalPracticePanel {...current} />);
    await click(button("Послушать пару ещё раз"), 1);
    expect(current.onListen).toHaveBeenCalledTimes(2);
    expect(current.onHelp).not.toHaveBeenCalled();
    await render(<IntervalPracticePanel {...current} paused ready={false} />);
    expect(button("Послушать пару ещё раз").disabled).toBe(true);
    expect(button("Продолжить интервалы").disabled).toBe(false);
    await click(button("Продолжить интервалы"));
    expect(current.onPause).toHaveBeenCalledTimes(2);
  });

  it("shows translated failure/retry and listen counts without treating failure as presentation", async () => {
    const current = { ...props(), onListen: vi.fn(), onRetry: vi.fn() };
    await render(
      <IntervalPracticePanel
        {...current}
        error
        renderError
        ready={false}
        fullListeningCount={0}
        partialListeningCount={1}
      />
    );
    expect(host.textContent).toContain("Полных прослушиваний: 0; прерванных: 1.");
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(button("Повтор ноты").disabled).toBe(true);
    await click(button("Послушать пару"));
    await click(button("Повторить загрузку стана"));
    expect(current.onListen).toHaveBeenCalledOnce();
    expect(current.onRetry).toHaveBeenCalledOnce();
    await english();
    expect(host.textContent).toContain(
      "Couldn't play the pair. Enable sound and try listening again."
    );
    expect(host.textContent).toContain("Full listens: 0; interrupted: 1.");
    expect(host.textContent).toContain("Reload staff");
  });
});

describe("mode-specific interval progress", () => {
  it("labels pointer category buttons separately from screen piano keys and filters only summary", async () => {
    const onSource = vi.fn();
    const history = [completedRun("see-and-play"), completedRun("hear-and-choose")];
    await render(
      <IntervalProgress
        history={history}
        mode="hear-and-choose"
        source="all"
        onSource={onSource}
        result={null}
      />
    );
    expect(host.querySelector("select")).toBeNull();
    await reveal("interval:practice:progress");
    const select = host.querySelector("select");
    if (!select) throw new Error("Missing source filter");
    expect([...select.options].map((option) => option.value)).toEqual([
      "all",
      "keyboard",
      "pointer"
    ]);
    expect(select.querySelector('option[value="pointer"]')?.textContent).toBe(
      "Кнопки выбора интервала"
    );
    expect(host.textContent).not.toContain("Экранные клавиши");
    await act(async () => {
      await Promise.resolve();
      select.value = "pointer";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSource).toHaveBeenCalledWith("pointer");
    const details = [...host.querySelectorAll("details")];
    expect(details[2]?.querySelector("summary")?.textContent).toBe("История интервалов: 1");
    expect(details[2]?.querySelectorAll(".reading-results")).toHaveLength(1);
    expect(details[2]?.textContent).toContain("выбор категории на слух");
    expect(details[2]?.textContent).not.toContain("игра пары по нотам");
    await english();
    expect(select.querySelector('option[value="pointer"]')?.textContent).toBe(
      "Interval choice buttons"
    );
    expect(details[2]?.querySelector("summary")?.textContent).toBe("Interval history: 1");
    await render(
      <IntervalProgress
        history={history}
        mode="see-and-play"
        source="pointer"
        onSource={onSource}
        result={null}
      />
    );
    expect(host.querySelector('option[value="pointer"]')?.textContent).toBe("On-screen keys");
    expect(host.querySelector('option[value="midi"]')?.textContent).toBe("MIDI piano");
  });

  it("keeps assisted independence at zero with no fake zero-time median in both languages", async () => {
    const result = completedRun("hear-and-choose", true);
    await render(<IntervalResults results={[result]} mode="hear-and-choose" source="pointer" />);
    expect(host.textContent).toContain(
      "Пар: 10; верно с первой попытки: 10; самостоятельно: 0; решено без помощи: 0."
    );
    expect(host.textContent).toContain(
      "Верно с первого прослушивания: 0; полных прослушиваний: 10; прерванных: 0."
    );
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.querySelector("td:last-child")?.textContent === "—")).toBe(true);
    expect(host.querySelectorAll('[aria-label="Пока нет данных о времени ответа"]')).toHaveLength(
      5
    );
    await english();
    expect(host.textContent).toContain(
      "Pairs: 10; correct first try: 10; independent: 0; solved without help: 0."
    );
    expect(host.querySelectorAll('[aria-label="No response time data yet"]')).toHaveLength(5);
  });

  it("retains other-source wrong attacks when a visual pair is filtered by its final pointer answer", async () => {
    const result = completedRun("see-and-play");
    await render(<IntervalResults results={[result]} mode="see-and-play" source="pointer" />);
    expect(host.textContent).toContain("Это игра пары по нотам");
    expect(host.textContent).toContain(
      "Пар: 10; верно с первой попытки: 0; самостоятельно: 0; решено без помощи: 10."
    );
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows.every((row) => row.querySelector("td:nth-child(3)")?.textContent === "2")).toBe(
      true
    );
    await render(<IntervalResults results={[result]} mode="see-and-play" source="midi" />);
    expect(host.textContent).toContain("Пар: 0;");
    expect(host.querySelectorAll('[aria-label="Пока нет данных о времени ответа"]')).toHaveLength(
      15
    );
    await english();
    expect(host.textContent).toContain("This measures playing a pair from the score");
    expect(host.textContent).not.toContain("Correct after one listen");
  });
});
