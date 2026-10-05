// @vitest-environment happy-dom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiSettings } from "./MidiSettings";

let host: HTMLDivElement;
let root: Root;
const onRange = vi.fn();
const onCapture = vi.fn();
const onCancelCapture = vi.fn();
type Keyboard = ComponentProps<typeof MidiSettings>["keyboard"];

async function render(keyboard: Partial<Keyboard> = {}) {
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
