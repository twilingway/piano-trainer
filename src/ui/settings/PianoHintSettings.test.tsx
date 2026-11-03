// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_STAFF_PREFS } from "../../app/staffPreferences";
import { PianoHintSettings, type PianoHintPrefs } from "./PianoHintSettings";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  vi.unstubAllGlobals();
});

function control(name: string) {
  const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${name}"]:is(input,select)`
  );
  if (!element) throw new Error(`Missing hint control: ${name}`);
  return element;
}
function checkbox(name: string) {
  const element = control(name);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Expected checkbox: ${name}`);
  return element;
}
function select(name: string, value: string) {
  act(() => {
    const element = control(name);
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it.each(["ru", "en"] as const)(
  "has three adjacent groups and localized target labels in %s",
  (language) => {
    setInterfaceLanguage(language);
    act(() => {
      root.render(
        <PianoHintSettings
          prefs={DEFAULT_STAFF_PREFS}
          hasScore
          wordTyping={false}
          onChange={vi.fn()}
        />
      );
    });
    const titles =
      language === "ru"
        ? ["Подсказки на клавишах", "Подсказки на падающих нотах", "Подсказки на нотном стане"]
        : ["Hints on piano keys", "Hints on falling notes", "Hints on the staff"];
    expect(Array.from(host.children, (group) => group.getAttribute("aria-label"))).toEqual(titles);
    const controls = Array.from(host.querySelectorAll("input,select"));
    const labels = controls.map((element) => element.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(9);
    expect(labels.every(Boolean)).toBe(true);
    expect(host.querySelectorAll("select")).toHaveLength(3);
    for (const element of host.querySelectorAll("select")) {
      if (element.options[0]?.value !== "off") continue;
      expect(Array.from(element.options, (option) => option.textContent)).toEqual(
        language === "ru" ? ["Нет", "До Ре Ми", "C D E"] : ["None", "Do Re Mi", "C D E"]
      );
    }
  }
);

it("changes every hint independently, allowing names with fingers", () => {
  const changed = vi.fn();
  function ControlledHints() {
    const [prefs, setPrefs] = useState<PianoHintPrefs>({
      ...DEFAULT_STAFF_PREFS,
      labels: false,
      octaveLabels: true,
      keyboardFingers: true,
      fallingNoteNames: "off",
      fallingFingers: true,
      noteNames: "en",
      fingers: true,
      chords: true,
      fingerColors: "fingers"
    });
    return (
      <PianoHintSettings
        prefs={prefs}
        hasScore
        wordTyping={false}
        onChange={(patch) => {
          changed(patch);
          setPrefs((old) => ({ ...old, ...patch }));
        }}
      />
    );
  }
  act(() => {
    root.render(<ControlledHints />);
  });
  const toggles = [
    ["Названия нот на клавишах", { labels: true }],
    ["Номера октав на клавишах", { octaveLabels: false }],
    ["Номера пальцев на клавишах", { keyboardFingers: false }],
    ["Номера пальцев на падающих нотах", { fallingFingers: false }],
    ["Аккорды на нотном стане", { chords: false }]
  ] as const;
  select("Названия на падающих нотах", "ru");
  expect(changed).toHaveBeenLastCalledWith({ fallingNoteNames: "ru" });
  expect(checkbox("Номера пальцев на падающих нотах").checked).toBe(true);
  expect(control("Названия на нотном стане").value).toBe("en");
  for (const [label, patch] of toggles) {
    act(() => {
      checkbox(label).click();
    });
    expect(changed).toHaveBeenLastCalledWith(patch);
  }
  select("Названия на нотном стане", "off");
  expect(changed).toHaveBeenLastCalledWith({ noteNames: "off" });
  expect(control("Названия на падающих нотах").value).toBe("ru");
  select("Цвет номеров пальцев на нотном стане", "mono");
  expect(changed).toHaveBeenLastCalledWith({ fingerColors: "mono" });
  act(() => {
    checkbox("Номера пальцев на нотном стане").click();
  });
  expect(changed).toHaveBeenLastCalledWith({ fingers: false });
  expect(control("Цвет номеров пальцев на нотном стане").disabled).toBe(true);
  expect(control("Цвет номеров пальцев на нотном стане").value).toBe("mono");
  expect(changed).toHaveBeenCalledTimes(9);
});

it("keeps piano hints available without a score and preserves typing eligibility", () => {
  const changed = vi.fn();
  act(() => {
    root.render(
      <PianoHintSettings
        prefs={DEFAULT_STAFF_PREFS}
        hasScore={false}
        wordTyping={false}
        onChange={changed}
      />
    );
  });
  expect(host.children).toHaveLength(3);
  expect(host.querySelectorAll("input,select")).toHaveLength(5);
  expect(host.textContent).toContain("нет нотной записи");
  act(() => {
    root.render(
      <PianoHintSettings prefs={DEFAULT_STAFF_PREFS} hasScore wordTyping onChange={changed} />
    );
  });
  expect(host.children).toHaveLength(1);
  expect(host.firstElementChild?.getAttribute("aria-label")).toBe("Подсказки на нотном стане");
  expect(host.querySelectorAll("input,select")).toHaveLength(4);
  expect(host.textContent).toContain("пианинным табам");
  expect(changed).not.toHaveBeenCalled();
});
