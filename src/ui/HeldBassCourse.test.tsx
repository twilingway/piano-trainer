// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { HeldBassIntro } from "./HeldBassIntro";
import { HeldBassPracticePanel, type HeldBassPracticeProps } from "./HeldBassCourse";

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
    expect(host.textContent).toContain("Hold the bass, play the melody");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Wait for the next note");
    expect(host.textContent).not.toContain("Bass and expected note:");
    const hint = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Hint"
    );
    expect(hint?.disabled).toBe(true);
  });
  it("offers retry after a staff error and keeps empty medians unknown", () => {
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
    expect(host.querySelector('[aria-label="Нет данных об удержании баса"]')).not.toBeNull();
  });
});
