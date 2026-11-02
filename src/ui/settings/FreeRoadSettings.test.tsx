// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_FREE_DIRECT_FIELD } from "../../render/freeRoadLayout";
import { FreeRoadSettings } from "./FreeRoadSettings";
import { PlayerSettings } from "./PlayerSettings";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  vi.unstubAllGlobals();
});
it.each(["ru", "en"] as const)("shows metric limits and localized shapes in %s", (locale) => {
  setInterfaceLanguage(locale);
  const change = vi.fn();
  act(() => {
    root.render(<FreeRoadSettings value={DEFAULT_FREE_DIRECT_FIELD} onChange={change} />);
  });
  const ranges = [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  expect(ranges.map((input) => [input.min, input.max, input.step])).toEqual([
    ["-90", "90", "0.01"],
    ["0.05", "1000", "0.01"],
    ["0.25", "1000", "0.01"],
    ["2", "10000", "0.01"]
  ]);
  expect(ranges[0]?.getAttribute("aria-label")).toBe(
    locale === "ru" ? "Наклон поля, °" : "Field tilt, °"
  );
  const select = host.querySelector("select");
  if (!select) throw new Error("Expected shape selector");
  expect([...select.options].map((option) => option.textContent)).toEqual(
    locale === "ru"
      ? ["Линия", "Выпуклая дуга", "Вогнутая дуга"]
      : ["Line", "Convex arc", "Concave arc"]
  );
  act(() => {
    select.value = "concave";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ shape: "concave" });
  const length = ranges[1];
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!length || !descriptor?.set) throw new Error("Expected length slider and native setter");
  act(() => {
    descriptor.set?.call(length, "7.5");
    length.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ length: 7.5 });
});

it.each(["ru", "en"] as const)(
  "links free-camera FAQ to each real metric control in %s",
  async (locale) => {
    setInterfaceLanguage(locale);
    await act(async () => {
      root.render(
        <PlayerSettings
          open
          freeCamera
          wordTyping={false}
          onClose={() => undefined}
          play={null}
          rules={null}
          song={null}
          computer={null}
          midi={null}
          synchronization={null}
          view={<FreeRoadSettings value={DEFAULT_FREE_DIRECT_FIELD} onChange={() => undefined} />}
        />
      );
      await Promise.resolve();
    });
    for (const target of ["tilt", "length", "width", "shape"]) {
      const help = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (button) => button.textContent === (locale === "ru" ? "Помощь" : "Help")
      );
      if (!help) throw new Error("Expected help tab");
      await act(async () => {
        help.click();
        await Promise.resolve();
      });
      const link = host.querySelector<HTMLButtonElement>(
        `[data-help-target="free-source-${target}"]`
      );
      expect(link).not.toBeNull();
      if (!link) throw new Error("Expected help destination");
      expect(host.querySelector('[data-help-target="road-horizon"]')).toBeNull();
      await act(async () => {
        link.click();
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(
        host.querySelector(`[data-setting-target="free-source-${target}"]`)
      );
    }
  }
);

function editInput(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) throw new Error("Expected native input setter");
  act(() => {
    descriptor.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it.each(["ru", "en"] as const)(
  "keeps large metric number fields and sliders consistent in %s",
  (locale) => {
    setInterfaceLanguage(locale);
    const change = vi.fn();
    const value = {
      ...DEFAULT_FREE_DIRECT_FIELD,
      tilt: -20.07,
      length: 87.57,
      width: 95.25,
      radius: 100,
      shape: "convex" as const
    };
    act(() => {
      root.render(<FreeRoadSettings value={value} onChange={change} />);
    });
    for (const key of ["tilt", "length", "width", "radius"] as const) {
      const number = host.querySelector<HTMLInputElement>(
        `[data-setting-target="free-source-${key}-number"]`
      );
      const range = host.querySelector<HTMLInputElement>(
        `[data-setting-target="free-source-${key}"]`
      );
      expect(number?.value).toBe(String(value[key]));
      expect(range?.value).toBe(String(value[key]));
      expect(number?.min).toBe(range?.min);
      expect(number?.max).toBe(range?.max);
    }
    const radius = host.querySelector<HTMLInputElement>(
      '[data-setting-target="free-source-radius-number"]'
    );
    if (!radius) throw new Error("Missing radius number field");
    expect(radius.min).toBe("47.625");
    expect(radius.getAttribute("aria-label")).toContain(
      locale === "ru" ? "Радиус мирового горизонта" : "World horizon radius"
    );
    editInput(radius, "10");
    expect(change).toHaveBeenLastCalledWith({ radius: 47.625 });
    expect(host.textContent).toContain(
      locale === "ru" ? "не может быть меньше её половины" : "cannot be less than half the width"
    );
  }
);

it("allows an empty numeric draft without resetting the saved horizon", () => {
  const change = vi.fn();
  act(() => {
    root.render(<FreeRoadSettings value={DEFAULT_FREE_DIRECT_FIELD} onChange={change} />);
  });
  const tilt = host.querySelector<HTMLInputElement>(
    '[data-setting-target="free-source-tilt-number"]'
  );
  if (!tilt) throw new Error("Missing tilt number field");
  act(() => {
    tilt.focus();
  });
  editInput(tilt, "");
  expect(tilt.value).toBe("");
  expect(change).not.toHaveBeenCalled();
  editInput(tilt, "-20.07");
  expect(tilt.value).toBe("-20.07");
  expect(change).toHaveBeenLastCalledWith({ tilt: -20.07 });
  editInput(tilt, "");
  act(() => {
    tilt.blur();
  });
  expect(tilt.value).toBe("90");
});

it("clamps a widened chord and its radius together", () => {
  const change = vi.fn();
  act(() => {
    root.render(<FreeRoadSettings value={DEFAULT_FREE_DIRECT_FIELD} onChange={change} />);
  });
  const width = host.querySelector<HTMLInputElement>(
    '[data-setting-target="free-source-width-number"]'
  );
  if (!width) throw new Error("Missing width number field");
  editInput(width, "95.25");
  expect(change).toHaveBeenLastCalledWith({ width: 95.25, radius: 47.625 });
});
