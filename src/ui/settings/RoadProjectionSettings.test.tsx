// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { RoadProjectionSettings } from "./RoadProjectionSettings";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
function input(target: string): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>('[data-setting-target="' + target + '"]');
  if (!element) throw new Error("Missing projection control " + target);
  return element;
}
function edit(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) throw new Error("Missing native input setter");
  act(() => {
    descriptor.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it.each(["ru", "en"] as const)(
  "keeps percent sliders and numeric edits canonical in %s",
  (locale) => {
    setInterfaceLanguage(locale);
    const changed = vi.fn();
    function Harness() {
      const [value, setValue] = useState({ horizon: 1.2, far: -0.01 });
      return (
        <RoadProjectionSettings
          value={value}
          enabled
          onChange={(change) => {
            changed(change);
            setValue((previous) => ({ ...previous, ...change }));
          }}
        />
      );
    }
    act(() => {
      root.render(<Harness />);
    });
    const horizon = input("road-horizon");
    const number = input("road-horizon-number");
    expect([horizon.min, horizon.max, horizon.step, horizon.value]).toEqual([
      "0",
      "150",
      "1",
      "120"
    ]);
    expect(number.getAttribute("aria-label")).toContain(
      locale === "ru" ? "Перспектива: горизонт" : "Perspective: horizon"
    );
    act(() => {
      number.focus();
    });
    edit(number, "125");
    expect(changed).toHaveBeenLastCalledWith({ horizon: 1.25 });
    expect(horizon.value).toBe("125");
    expect(input("road-width-number").value).toBe("-1");

    changed.mockClear();
    edit(number, "");
    expect(number.value).toBe("");
    expect(changed).not.toHaveBeenCalled();
    act(() => {
      number.blur();
    });
    expect(number.value).toBe("125");
    act(() => {
      number.focus();
    });
    edit(number, "999");
    expect(changed).toHaveBeenLastCalledWith({ horizon: 1.5 });
    act(() => {
      number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(number.value).toBe("150");
    expect(horizon.value).toBe("150");

    const far = input("road-width-number");
    act(() => {
      far.focus();
    });
    edit(far, "-999");
    expect(changed).toHaveBeenLastCalledWith({ far: -1 });
    act(() => {
      far.blur();
    });
    expect(far.value).toBe("-100");
    expect(input("road-width").value).toBe("-100");
  }
);
it("disables both input methods in direct projection without changing their saved values", () => {
  const changed = vi.fn();
  act(() => {
    root.render(
      <RoadProjectionSettings
        value={{ horizon: 1.2, far: 0.3 }}
        enabled={false}
        onChange={changed}
      />
    );
  });
  expect([...host.querySelectorAll("input")].every((element) => element.disabled)).toBe(true);
  expect(input("road-horizon-number").value).toBe("120");
  expect(input("road-width-number").value).toBe("30");
  expect(changed).not.toHaveBeenCalled();
});
