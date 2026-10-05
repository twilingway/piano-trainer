// @vitest-environment happy-dom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiSettings } from "./MidiSettings";
import type { MidiOutputControls } from "./MidiSettings";

let host: HTMLDivElement;
let root: Root;
const onRange = vi.fn();
const onCapture = vi.fn();
const onCancelCapture = vi.fn();
type Keyboard = ComponentProps<typeof MidiSettings>["keyboard"];

async function render(keyboard: Partial<Keyboard> = {}, output?: MidiOutputControls) {
  await act(async () => {
    await Promise.resolve();
    root.render(
      <MidiSettings
        devices={[]}
        deviceId="all"
        onDevice={vi.fn()}
        midiError={null}
        keyboard={{
          range: { preset: "88" },
          onRange,
          capture: null,
          onCapture,
          onCancelCapture,
          ...keyboard
        }}
        output={output}
      />
    );
  });
}
function keyboardSelect() {
  const element = host.querySelector<HTMLSelectElement>("select[aria-label='Моя клавиатура']");
  if (!element) throw new Error("Missing keyboard selector");
  return element;
}
function button(text: string) {
  const element = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === text
  );
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe("MidiSettings keyboard range", () => {
  it("lists the presets with their keys and picks one", async () => {
    await render();
    const select = keyboardSelect();
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "88 клавиш (A0–C8)",
      "76 клавиш (E1–G7)",
      "61 клавиша (C2–C7)",
      "49 клавиш (C2–C6)",
      "37 клавиш (C3–C6)",
      "25 клавиш (C3–C5)"
    ]);
    await act(async () => {
      await Promise.resolve();
      select.value = "61";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onRange).toHaveBeenCalledWith({ preset: "61" });
  });

  it("shows a captured range", async () => {
    await render({ range: { preset: "custom", low: 48, high: 84 } });
    expect(keyboardSelect().value).toBe("custom");
    expect(keyboardSelect().selectedOptions[0]?.textContent).toBe(
      "Свой диапазон: C3–C6, клавиш: 37"
    );
  });

  it("walks the player through a capture", async () => {
    await render();
    button("Определить нажатием").click();
    expect(onCapture).toHaveBeenCalled();
    await render({ capture: { step: "first" } });
    expect(host.textContent).toContain("Нажмите самую нижнюю клавишу своей клавиатуры");
    expect(keyboardSelect().disabled).toBe(true);
    await render({ capture: { step: "second", first: 48 } });
    expect(host.textContent).toContain("Теперь нажмите самую верхнюю клавишу");
    button("Отмена").click();
    expect(onCancelCapture).toHaveBeenCalled();
  });
});

describe("MidiSettings output", () => {
  const onSelect = vi.fn();
  const onTest = vi.fn();
  const piano = { id: "a", name: "Digital Piano" };
  const output = (rest: Partial<MidiOutputControls>): MidiOutputControls => ({
    devices: [],
    choice: null,
    connected: false,
    selectedId: "",
    onSelect,
    onTest,
    ...rest
  });
  function outputSelect() {
    const element = host.querySelector<HTMLSelectElement>("select[aria-label='Выход MIDI']");
    if (!element) throw new Error("Missing output selector");
    return element;
  }

  it("is hidden without Web MIDI", async () => {
    await render();
    expect(host.querySelector("select[aria-label='Выход MIDI']")).toBeNull();
  });

  it("offers none and the connected outputs, and tests the chosen one", async () => {
    await render({}, output({ devices: [piano], choice: piano, connected: true, selectedId: "a" }));
    const select = outputSelect();
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Нет",
      "Digital Piano"
    ]);
    expect(select.value).toBe("a");
    button("Проверить").click();
    expect(onTest).toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("keeps a disconnected choice and disables the test", async () => {
    await render({}, output({ choice: piano, selectedId: "a" }));
    expect(outputSelect().selectedOptions[0]?.textContent).toBe("Digital Piano — нет связи");
    expect(button("Проверить").disabled).toBe(true);
  });

  it("has nothing to test without outputs", async () => {
    await render({}, output({}));
    expect([...outputSelect().options].map((option) => option.textContent)).toEqual(["Нет"]);
    expect(button("Проверить").disabled).toBe(true);
  });
});
