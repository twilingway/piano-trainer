// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { HeldBassIntro } from "./HeldBassIntro";
import {
  HeldBassCourseCard,
  HeldBassPracticePanel,
  type HeldBassPracticeProps
} from "./HeldBassCourse";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
});
function render(node: ReactNode, locale: "ru" | "en" = "ru") {
  act(() => {
    setInterfaceLanguage(locale);
    root.render(node);
  });
}
function props(): HeldBassPracticeProps {
  return {
    index: 2,
    step: 1,
    melodyLength: 4,
    ready: true,
    status: "ready",
    hintLevel: 0,
    pitches: [48, 64],
    renderError: false,
    preferences: DEFAULT_READING_PREFERENCES,
    result: null,
    history: [],
    sourceFilter: "all",
    onSourceFilter: vi.fn(),
    onHint: vi.fn(),
    onRetry: vi.fn(),
    onNewSeries: vi.fn(),
    onExit: vi.fn(),
    onPreferences: vi.fn()
  };
}
async function reveal(id: string, open = true) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing lesson details: ${id}`);
  await act(async () => {
    await Promise.resolve();
    details.open = open;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
}
describe("held bass course interface", () => {
  it("asks to wait during count-in rather than accepting an early start", () => {
    render(<HeldBassPracticePanel {...props()} step={0} ready={false} />);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Дождитесь начала фрагмента. Пока не нажимайте клавиши."
    );
  });
  it("explains real bindings and the bass, overlap, pedal and retry rules", () => {
    render(
      <HeldBassIntro
        bindings={[
          { pitch: 48, label: "X" },
          { pitch: 60, label: "7" }
        ]}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(host.textContent).toContain("Знакомство с удержанием баса");
    expect(host.textContent).toContain("Педаль не заменяет");
    expect(host.textContent).toContain("Две соседние правые ноты могут перекрываться");
    expect(host.textContent).toContain("повторяют весь текущий фрагмент");
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(10);
    expect(rows[0]?.textContent).toContain("X");
    expect(rows[5]?.textContent).toContain("7");
    expect(rows[1]?.textContent).toContain("Нет назначения");
  });
  it("shows the current step without asking for another simultaneous start", () => {
    render(<HeldBassPracticePanel {...props()} />);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Держите бас и сыграйте следующую правую ноту."
    );
    expect(host.textContent).toContain("Фрагмент с басом 3 из 10");
    expect(host.textContent).not.toContain("Бас и ожидаемая нота:");
    const value = props();
    value.hintLevel = 1;
    render(<HeldBassPracticePanel {...value} />);
    expect(host.textContent).toContain("Бас и ожидаемая нота: до 3 + ми 4");
  });
  it("localizes the interface and does not reveal future names while travelling", () => {
    const value = props();
    value.ready = false;
    value.status = "travelling";
    value.hintLevel = 2;
    render(<HeldBassPracticePanel {...value} />, "en");
    expect(host.textContent).toContain("Bass-hold fragment 3 of 10");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Wait for the next note");
    expect(host.textContent).not.toContain("Bass and expected note:");
    const hint = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Hint"
    );
    expect(hint?.disabled).toBe(true);
  });
  it("offers visible retry after a staff error and keeps optional empty medians unknown", async () => {
    const value = props();
    value.renderError = true;
    render(<HeldBassPracticePanel {...value} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось показать ноты");
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Повторить загрузку стана"
    );
    act(() => {
      retry?.click();
    });
    expect(value.onRetry).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="Нет данных об удержании баса"]')).toBeNull();
    await reveal("held-bass:practice:progress");
    expect(host.querySelector('[aria-label="Нет данных об удержании баса"]')).not.toBeNull();
  });
  it("keeps its start and introduction available without constructing closed history", async () => {
    const onStart = vi.fn(),
      onIntro = vi.fn();
    render(
      <HeldBassCourseCard
        history={[]}
        sourceFilter="all"
        onSourceFilter={vi.fn()}
        onStart={onStart}
        onIntro={onIntro}
      />
    );
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector(".lesson-primary-action")?.textContent).toBe(
      "Начать десять фрагментов с басом"
    );
    expect(host.querySelector(".lesson-secondary-action")).toBeNull();
    await reveal("held-bass:catalog:more");
    expect(host.querySelector(".lesson-secondary-action")?.textContent).toBe(
      "Знакомство с удержанием баса"
    );
    expect(host.querySelector("select,dl")).toBeNull();
    await reveal("held-bass:catalog:progress");
    expect(onStart).not.toHaveBeenCalled();
    expect(onIntro).not.toHaveBeenCalled();
    expect(host.querySelector('[data-window-detail="held-bass:history"]')).not.toBeNull();
    act(() => {
      host.querySelector<HTMLButtonElement>(".lesson-primary-action")?.click();
      host.querySelector<HTMLButtonElement>(".lesson-secondary-action")?.click();
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(onIntro).toHaveBeenCalledOnce();
  });
  it("keeps status and the current result visible and never treats guide disclosure as musical help", async () => {
    const value = props();
    const result: NonNullable<HeldBassPracticeProps["result"]> = {
      id: "current",
      runId: "run",
      skillId: "held-bass-reading",
      task: "held-bass",
      exerciseId: "exercise",
      seed: 1,
      generatorVersion: 1,
      startedAt: 0,
      completedAt: 1000,
      createdAt: 1000,
      fragments: []
    };
    render(<HeldBassPracticePanel {...value} result={result} history={[result]} />);
    const current = host.querySelector(".reading-results");
    expect(current).not.toBeNull();
    expect(current?.closest("details")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Серия удержания баса завершена"
    );
    expect(host.querySelector("input,select")).toBeNull();
    expect(host.textContent).toContain("Завершено · 10 из 10");
    await reveal("held-bass:practice:guide");
    expect(host.textContent).toContain("настоящий мультитач");
    await reveal("held-bass:practice:guide", false);
    expect(host.querySelector(".reading-results")).toBe(current);
    expect(value.onHint).not.toHaveBeenCalled();
    expect(value.onNewSeries).not.toHaveBeenCalled();
    expect(value.onPreferences).not.toHaveBeenCalled();
    await reveal("held-bass:practice:settings");
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => {
      checkbox?.click();
    });
    expect(value.onPreferences).toHaveBeenCalledExactlyOnceWith({ automaticHints: false });
    const action = (label: string) =>
      [...host.querySelectorAll("button")].find((button) => button.textContent === label);
    expect(action("Подсказка")?.disabled).toBe(true);
    // A finished series offers a new one as the main action, not as a second panel button.
    expect(action("Новая серия")).toBeUndefined();
    act(() => {
      action("Выйти")?.click();
    });
    expect(value.onNewSeries).not.toHaveBeenCalled();
    expect(value.onExit).toHaveBeenCalledOnce();
  });
});
