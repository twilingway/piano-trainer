// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import { TwoHandPracticePanel, type TwoHandPracticeProps } from "./TwoHandCourse";
import { TwoHandIntro } from "./TwoHandIntro";
let root: Root, host: HTMLDivElement;
const noop = () => undefined;
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
  it("hides current names until help and explains release finality in both languages", () => {
    act(() => {
      root.render(<TwoHandPracticePanel {...props} />);
    });
    expect(host.textContent).not.toContain("Текущая пара");
    expect(host.textContent).toContain("Одной мышью");
    act(() => {
      root.render(<TwoHandPracticePanel {...props} hintLevel={1} status="release" />);
    });
    expect(host.textContent).toContain("Текущая пара: до 3 + до 4");
    expect(host.textContent).toContain("Пара ещё проверяется");
    act(() => {
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Current pair:");
    expect(host.textContent).toContain("The pair is still being checked");
    expect(host.textContent).not.toContain("Две руки");
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
