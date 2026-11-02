// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { LessonDetails } from "./LessonDetails";
import { LessonMenuItem, LessonSlot } from "./LessonSlots";
import { LessonWorkspace, type LessonWindowControls } from "./LessonWorkspace";

let host: HTMLDivElement;
let root: Root;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing element");
  return value;
}
function button(label: string) {
  return required(
    [...host.querySelectorAll("button")].find((item) => item.textContent.startsWith(label))
  );
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}

function Panel({ hint, onNewSeries }: { hint: boolean; onNewSeries: () => void }) {
  return (
    <section>
      <LessonSlot name="counter">
        <span className="lesson-counter">Нота 3 из 20</span>
      </LessonSlot>
      <LessonSlot name="exit">
        <button type="button">Выйти</button>
      </LessonSlot>
      <LessonSlot name="hint">
        <button type="button">Подсказка</button>
      </LessonSlot>
      {hint && (
        <LessonSlot name="feedback">
          <p className="reading-hint">Подсказка: ми 4</p>
        </LessonSlot>
      )}
      <LessonMenuItem kind="newSeries" label="Новая серия" onSelect={onNewSeries} />
      <LessonDetails kind="settings" id="test:settings">
        <p>Параметры теста</p>
      </LessonDetails>
      <LessonDetails kind="guide" id="test:guide">
        <p>Справка теста</p>
      </LessonDetails>
    </section>
  );
}

async function render(windows: LessonWindowControls, hint = false, onNewSeries = vi.fn()) {
  await act(async () => {
    root.render(
      <LessonWorkspace
        title="Правая рука: пять нот"
        instruction="Посмотрите на ноту и нажмите её клавишу."
        input="Играйте на MIDI"
        score={<div className="staff" />}
        action={<button type="button">Играть</button>}
        windows={windows}
      >
        <Panel hint={hint} onNewSeries={onNewSeries} />
      </LessonWorkspace>
    );
    await Promise.resolve();
  });
}

describe("lesson workspace", () => {
  it("puts the panel's counter, exit, hint and feedback in fixed places", async () => {
    await render({ open: null, onOpen: vi.fn(), interruptsAttempt: false });
    expect(host.querySelector(".lesson-workspace__counter")?.textContent).toBe("Нота 3 из 20");
    expect(host.querySelector(".lesson-workspace__exit")?.textContent).toBe("Выйти");
    const actions = required(host.querySelector(".lesson-workspace__actions"));
    expect([...actions.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Играть",
      "Подсказка"
    ]);
    const feedback = required(host.querySelector(".lesson-workspace__feedback"));
    expect(feedback.textContent).toBe("");
    await render({ open: null, onOpen: vi.fn(), interruptsAttempt: false }, true);
    expect(host.querySelector(".lesson-workspace__feedback")).toBe(feedback);
    expect(feedback.textContent).toBe("Подсказка: ми 4");
    expect(host.querySelector(".lesson-workspace__actions")).toBe(actions);
    const controls = required(host.querySelector(".lesson-workspace__controls"));
    // Only the closed windows stay in the panel itself.
    expect([...controls.querySelectorAll("button")].every((item) => item.closest("dialog"))).toBe(
      true
    );
  });

  it("opens and closes the menu without touching the lesson window", async () => {
    const onOpen = vi.fn();
    const onNewSeries = vi.fn();
    await render({ open: null, onOpen, interruptsAttempt: true }, false, onNewSeries);
    const list = required(host.querySelector<HTMLElement>(".lesson-menu__list"));
    expect(list.hidden).toBe(true);
    expect([...list.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Новая серия",
      "Как выполнять задание",
      "Параметры заданияостановит попытку"
    ]);
    const toggle = button("Меню урока");
    await click(toggle);
    expect(list.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    await click(toggle);
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });
    expect(list.hidden).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
    await click(toggle);
    await click(button("Новая серия"));
    expect(onNewSeries).toHaveBeenCalledOnce();
    expect(list.hidden).toBe(true);
    await click(toggle);
    await click(button("Параметры задания"));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("test:settings");
  });

  it("opens the guide from the menu without a lesson window", async () => {
    const onOpen = vi.fn();
    await render({ open: null, onOpen, interruptsAttempt: true });
    expect(host.textContent).not.toContain("Справка теста");
    await click(button("Меню урока"));
    await click(button("Как выполнять задание"));
    expect(host.textContent).toContain("Справка теста");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
