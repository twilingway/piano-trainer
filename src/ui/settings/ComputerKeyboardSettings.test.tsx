// @vitest-environment happy-dom
import { act, useEffect, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComputerKeyboard, type ComputerKeyboardControls } from "../../app/useComputerKeyboard";
import { useShortcuts } from "../../app/useShortcuts";
import { listenToComputerKeyboard } from "../../input/computerKeyboard";
import type { MidiEvent } from "../../input/midiInput";
import { ComputerKeyboardSettings } from "./ComputerKeyboardSettings";

// Native dialog focus/trapping is browser-owned; keep the real editor and hook interactions.
vi.mock("../GameDialog", () => ({
  GameDialog: ({
    children,
    title,
    onClose
  }: {
    children: ReactNode;
    title: string;
    onClose: () => void;
  }) => (
    <section role="dialog" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose}>
        Закрыть
      </button>
      {children}
    </section>
  )
}));

let root: Root;
let host: HTMLDivElement;
let controls: ComputerKeyboardControls;
let events: MidiEvent[];
const play = vi.fn();

function Harness({ visible = true }: { visible?: boolean }) {
  const current = useComputerKeyboard();
  useShortcuts({ play, blocked: current.editing });
  useLayoutEffect(() => {
    controls = current;
  });
  useEffect(
    () => listenToComputerKeyboard((event) => events.push(event), current.options),
    [current.options]
  );
  return visible ? <ComputerKeyboardSettings controls={current} /> : null;
}

async function mount(visible = true) {
  await act(async () => {
    root.render(<Harness visible={visible} />);
    await Promise.resolve();
  });
}

function button(name: string) {
  const result = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent.trim() === name || element.getAttribute("aria-label") === name
  );
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}
async function click(name: string) {
  await act(async () => {
    button(name).click();
    await Promise.resolve();
  });
}
async function select(label: string, value: string) {
  const element = host.querySelector<HTMLSelectElement>(`select[aria-label='${label}']`);
  if (!element) throw new Error(`Missing select: ${label}`);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}
async function key(code: string, type = "keydown") {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  await act(async () => {
    window.dispatchEvent(event);
    await Promise.resolve();
  });
  return event;
}
async function editNote(keyName: string, pitch: number) {
  await click(keyName);
  await select("Нота и октава", String(pitch));
  await click("Сохранить");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  events = [];
  play.mockClear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("computer keyboard assignment interactions", () => {
  it("suppresses the context menu, releases held notes, cancels a draft and saves an audible assignment", async () => {
    await mount();
    await key("KeyG");
    const context = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    await act(async () => {
      button("G: G3").dispatchEvent(context);
      await Promise.resolve();
    });
    expect(context.defaultPrevented).toBe(true);
    expect(host.querySelector("[role='dialog']")?.getAttribute("aria-label")).toBe(
      "Назначение клавиши G"
    );
    expect(events.map((event) => event.type)).toEqual(["down", "up"]);
    await select("Нота и октава", "65");
    await click("Отмена");
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 55 });
    expect(localStorage.getItem("computer-keyboard-v1")).toBeNull();
    await editNote("G: G3", 65);
    expect(button("G: F4")).toBeDefined();
    await key("KeyG");
    expect(events.at(-1)).toMatchObject({ type: "down", pitch: 65 });
    await key("KeyG", "keyup");
  });

  it("captures a different existing physical key, shows its assignment and only changes the captured key", async () => {
    await mount();
    await click("G: G3");
    await select("Нота и октава", "65");
    await click("Перехватить клавишу");
    expect(button("Сохранить").disabled).toBe(true);
    const captured = await key("KeyP");
    expect(captured.defaultPrevented).toBe(true);
    expect(controls.capturedCode).toBe("KeyP");
    expect(host.querySelector("[data-keyboard-editor]")?.textContent).toContain("Сейчас: E5.");
    expect(events).toEqual([]);
    expect(host.querySelector<HTMLSelectElement>("select[aria-label='Нота и октава']")?.value).toBe(
      "76"
    );
    await select("Нота и октава", "65");
    await click("Сохранить");
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 55 });
    expect(controls.bindings.KeyP).toEqual({ type: "note", pitch: 65 });
    await key("KeyP", "keyup");
    await key("KeyP");
    expect(events.at(-1)).toMatchObject({ type: "down", pitch: 65 });
  });

  it("cancels capture with Escape while leaving the editor draft intact", async () => {
    await mount();
    await click("G: G3");
    await click("Перехватить клавишу");
    await key("Escape");
    expect(controls.capturing).toBe(false);
    expect(host.querySelector("[role='dialog']")).not.toBeNull();
    expect(events).toEqual([]);
    await click("Отмена");
    expect(controls.options.blocked).toBe(false);
  });

  it("releases editing when settings unmount without disabling subsequent piano input", async () => {
    await mount();
    await click("G: G3");
    await click("Перехватить клавишу");
    expect(controls.options.blocked).toBe(true);
    await mount(false);
    expect(controls.options.blocked).toBe(false);
    expect(controls.capturing).toBe(false);
    await key("KeyG");
    expect(events.at(-1)).toMatchObject({ type: "down", pitch: 55 });
  });

  it("retains independent presets through reset and reload", async () => {
    await mount();
    await editNote("G: G3", 65);
    await select("Раскладка компьютера", "bass_chords");
    expect(button("G: C3")).toBeDefined();
    await editNote("G: C3", 66);
    await click("Сбросить эту раскладку");
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 48 });
    await select("Раскладка компьютера", "octave_layout");
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 65 });
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    expect(controls.prefs.preset).toBe("octave_layout");
    expect(button("G: F4")).toBeDefined();
    await select("Раскладка компьютера", "bass_chords");
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 48 });
  });

  it("shows failed persistence while keeping the new assignment usable in memory", async () => {
    await mount();
    const originalStorage = localStorage;
    vi.stubGlobal("localStorage", {
      getItem: originalStorage.getItem.bind(originalStorage),
      setItem: () => {
        throw new Error("quota");
      }
    });
    await editNote("G: G3", 65);
    expect(host.querySelector("[role='alert']")?.textContent).toContain(
      "Не удалось сохранить раскладку"
    );
    await key("KeyG");
    expect(events.at(-1)).toMatchObject({ type: "down", pitch: 65 });
    expect(localStorage.getItem("computer-keyboard-v1")).toBeNull();
  });

  it("initializes a captured Space editor with its sustain assignment", async () => {
    await mount();
    await click("G: G3");
    await click("Перехватить клавишу");
    await key("Space");
    expect(host.querySelector<HTMLSelectElement>("select[aria-label='Назначение']")?.value).toBe(
      "sustain"
    );
    expect(host.querySelector("select[aria-label='Нота и октава']")).toBeNull();
    await click("Сохранить");
    expect(controls.bindings.Space).toEqual({ type: "sustain" });
    expect(controls.bindings.KeyG).toEqual({ type: "note", pitch: 55 });
  });

  it("blocks Ctrl+Space on the editor close button and resumes shortcuts after closing", async () => {
    await mount();
    await click("G: G3");
    const close = button("Закрыть");
    const pause = new KeyboardEvent("keydown", {
      code: "Space",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    await act(async () => {
      close.dispatchEvent(pause);
      await Promise.resolve();
    });
    expect(play).not.toHaveBeenCalled();
    await click("Закрыть");
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        })
      );
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledOnce();
  });
});
