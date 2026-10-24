// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import type { PartRole } from "../../song/midiParts";
import type { PartsChoice } from "../CompactPracticeChoices";
import { PlaySettings } from "./PlaySettings";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
});

const noop = () => undefined;

function render(parts: PartsChoice | undefined, onHands = noop, onCountdownSeconds = noop) {
  act(() => {
    root.render(
      <PlaySettings
        countdownSeconds={3}
        onCountdownSeconds={onCountdownSeconds}
        metronome
        onMetronome={noop}
        listening={false}
        soundLoading={false}
        onListen={noop}
        stats={undefined}
        mode="wait"
        onMode={noop}
        hands="right"
        onHands={onHands}
        parts={parts}
        speed={1}
        onSpeed={noop}
        autoReview={false}
        onAutoReview={noop}
      />
    );
  });
}

const handsSelect = () => host.querySelector<HTMLSelectElement>('select[aria-label="Руки"]');

function parts(role: PartRole | null, change: Partial<PartsChoice> = {}): PartsChoice {
  return {
    roles: ["melody", "accompaniment", "bass"],
    role,
    onRole: noop,
    accompaniment: true,
    onAccompaniment: noop,
    ...change
  };
}

describe("PlaySettings parts", () => {
  it("offers the song's parts after the hands and picks one", () => {
    const onRole = vi.fn();
    render(parts(null, { onRole }));
    const select = handsSelect();
    expect(
      Array.from(select?.querySelectorAll("optgroup option") ?? []).map((item) => item.textContent)
    ).toEqual(["Мелодия (правая)", "Аккомпанемент (левая)", "Бас (левая)"]);
    expect(select?.querySelector("optgroup")?.label).toBe("Только одну партию");
    act(() => {
      if (!select) return;
      select.value = "part:bass";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onRole).toHaveBeenCalledWith("bass");
  });

  it("shows the chosen part as the selection and goes back to a hand", () => {
    const onHands = vi.fn();
    render(parts("accompaniment"), onHands);
    const select = handsSelect();
    expect(select?.value).toBe("part:accompaniment");
    act(() => {
      if (!select) return;
      select.value = "both";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onHands).toHaveBeenCalledWith("both");
  });

  it("lists no parts for a song whose parts are its hands, but keeps the accompaniment switch", () => {
    const onAccompaniment = vi.fn();
    render(parts(null, { roles: [], onAccompaniment }));
    expect(handsSelect()?.querySelector("optgroup")).toBeNull();
    const toggle = Array.from(host.querySelectorAll("label")).find((label) =>
      label.textContent.includes("Автоаккомпанемент")
    );
    const box = toggle?.querySelector<HTMLInputElement>("input[type=checkbox]");
    expect(box?.checked).toBe(true);
    act(() => {
      box?.click();
    });
    expect(onAccompaniment).toHaveBeenCalledWith(false);
  });

  it("has neither without a parts choice (ranked, word mode)", () => {
    render(undefined);
    expect(handsSelect()?.querySelector("optgroup")).toBeNull();
    expect(host.textContent).not.toContain("Автоаккомпанемент");
  });
});

it("offers bounded count-in seconds and sends zero without affecting other controls", () => {
  const changed = vi.fn();
  render(undefined, noop, changed);
  const box = host.querySelector<HTMLInputElement>('[data-setting-target="play-countdown"]');
  expect(box?.value).toBe("3");
  expect(box?.min).toBe("0");
  expect(box?.max).toBe("10");
  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!box || !value?.set) throw new Error("Expected countdown input");
  act(() => {
    value.set?.call(box, "0");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(changed).toHaveBeenCalledWith(0);
});
