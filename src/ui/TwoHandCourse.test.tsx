// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import {
  TwoHandCourseCard,
  TwoHandPracticePanel,
  type TwoHandPracticeProps
} from "./TwoHandCourse";
import { TwoHandIntro } from "./TwoHandIntro";
let root: Root, host: HTMLDivElement;
const noop = () => undefined;
async function reveal(id: string, open = true) {
  const details = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!details) throw new Error(`Missing lesson details: ${id}`);
  await act(async () => {
    await Promise.resolve();
    details.open = open;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));
  });
}
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
const props: TwoHandPracticeProps = {
  history: [],
  sourceFilter: "all",
  onSourceFilter: noop,
  index: 0,
  ready: true,
  status: "ready",
  hintLevel: 0,
  pitches: [48, 60],
  renderError: false,
  preferences: DEFAULT_READING_PREFERENCES,
  result: null,
  onHint: noop,
  onRetry: noop,
  onNewSeries: noop,
  onExit: noop,
  onPreferences: noop
};
describe("two-hand player interface", () => {
  it("hides current names until help and explains release finality in both languages", async () => {
    act(() => {
      root.render(<TwoHandPracticePanel {...props} />);
    });
    expect(host.textContent).not.toContain("Подсказка:");
    expect(host.textContent).not.toContain("Одной мышью");
    await reveal("two-hand-reading:practice:guide");
    expect(host.textContent).toContain("Одной мышью");
    act(() => {
      root.render(<TwoHandPracticePanel {...props} hintLevel={1} status="release" />);
    });
    expect(host.textContent).toContain("Подсказка: до 3 + до 4");
    expect(host.textContent).toContain("Пара ещё проверяется");
    act(() => {
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Hint:");
    expect(host.textContent).toContain("The pair is still being checked");
    expect(host.textContent).not.toContain("Две руки");
  });
  it("keeps the start and introduction visible and mounts progress only after disclosure", async () => {
    const onStart = vi.fn(),
      onIntro = vi.fn(),
      onSourceFilter = vi.fn();
    act(() => {
      root.render(
        <TwoHandCourseCard
          history={[]}
          sourceFilter="all"
          onSourceFilter={onSourceFilter}
          onStart={onStart}
          onIntro={onIntro}
        />
      );
    });
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector(".lesson-primary-action")?.textContent).toBe("Начать десять пар");
    expect(host.querySelector(".lesson-secondary-action")).toBeNull();
    await reveal("two-hands:catalog:more");
    expect(host.querySelector(".lesson-secondary-action")?.textContent).toBe(
      "Знакомство с совместной игрой"
    );
    expect(host.querySelector("select,dl")).toBeNull();
    await reveal("two-hand-reading:catalog:progress");
    expect(onStart).not.toHaveBeenCalled();
    expect(onIntro).not.toHaveBeenCalled();
    expect(host.querySelector('[data-window-detail="two-hand-reading:history"]')).not.toBeNull();
    const filter = required(host.querySelector("select"));
    act(() => {
      filter.value = "midi";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSourceFilter).toHaveBeenCalledExactlyOnceWith("midi");
    act(() => {
      host.querySelector<HTMLButtonElement>(".lesson-primary-action")?.click();
      host.querySelector<HTMLButtonElement>(".lesson-secondary-action")?.click();
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(onIntro).toHaveBeenCalledOnce();
  });
  it("keeps the current result and commands visible while guide, settings and old history are lazy", async () => {
    const result: NonNullable<TwoHandPracticeProps["result"]> = {
      id: "current",
      runId: "run",
      skillId: "two-hand-coordination",
      task: "simultaneous",
      exerciseId: "exercise",
      seed: 1,
      generatorVersion: 1,
      startedAt: 0,
      completedAt: 1000,
      createdAt: 1000,
      pairs: []
    };
    const onHint = vi.fn(),
      onNewSeries = vi.fn(),
      onExit = vi.fn(),
      onPreferences = vi.fn();
    act(() => {
      root.render(
        <TwoHandPracticePanel
          {...props}
          result={result}
          history={[result]}
          onHint={onHint}
          onNewSeries={onNewSeries}
          onExit={onExit}
          onPreferences={onPreferences}
        />
      );
    });
    const current = required(host.querySelector(".reading-results"));
    expect(current.closest("details")).toBeNull();
    expect(host.querySelector(".reading-history,input")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Серия двух рук завершена");
    expect(host.textContent).toContain("Завершено · 10 из 10");
    await reveal("two-hand-reading:practice:guide");
    await reveal("two-hand-reading:practice:guide", false);
    expect(host.querySelector(".reading-results")).toBe(current);
    expect(onHint).not.toHaveBeenCalled();
    expect(onNewSeries).not.toHaveBeenCalled();
    await reveal("two-hand-reading:practice:settings");
    expect(onPreferences).not.toHaveBeenCalled();
    const checkbox = required(host.querySelector<HTMLInputElement>('input[type="checkbox"]'));
    act(() => {
      checkbox.click();
    });
    expect(onPreferences).toHaveBeenCalledExactlyOnceWith({ automaticHints: false });
    await reveal("two-hand-reading:practice:progress");
    expect(host.querySelectorAll(".reading-history .reading-results")).toHaveLength(1);
    const action = (label: string) =>
      required([...host.querySelectorAll("button")].find((button) => button.textContent === label));
    expect(action("Подсказка").disabled).toBe(true);
    // A finished series offers a new one as the main action, not as a second panel button.
    expect(
      [...host.querySelectorAll("button")].some((button) => button.textContent === "Новая серия")
    ).toBe(false);
    act(() => {
      action("Выйти").click();
    });
    expect(onNewSeries).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledOnce();
  });
  it("offers manual help only for a presented active pair", () => {
    const onHint = vi.fn();
    act(() => {
      root.render(<TwoHandPracticePanel {...props} ready={false} onHint={onHint} />);
    });
    const button = required(
      [...host.querySelectorAll("button")].find((item) => item.textContent === "Подсказка")
    );
    expect(button.disabled).toBe(true);
    act(() => {
      root.render(<TwoHandPracticePanel {...props} onHint={onHint} />);
    });
    act(() => {
      button.click();
    });
    expect(onHint).toHaveBeenCalledOnce();
  });
  it("shows real custom bindings without inventing a missing key", () => {
    act(() => {
      root.render(
        <TwoHandIntro bindings={[{ pitch: 48, label: "Z" }]} onClose={noop} onStart={noop} />
      );
    });
    expect(host.textContent).toContain("Z");
    expect(host.textContent).toContain("Нет назначения для этой ноты");
    expect(host.textContent).toContain("не видит ваши руки");
    act(() => {
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("No binding for this note");
    expect(host.textContent).toContain("Computer keys for both hands");
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing fixture value");
  return value;
}
