// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_STAFF_PREFS } from "../../app/staffPreferences";
import { StaffSettings } from "./StaffSettings";

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

it.each(["ru", "en"] as const)("changes the played-note color independently in %s", (language) => {
  setInterfaceLanguage(language);
  const changed = vi.fn();
  act(() => {
    root.render(<StaffSettings hasScore prefs={DEFAULT_STAFF_PREFS} onChange={changed} />);
  });
  const name = language === "ru" ? "Цвет сыгранной ноты" : "Played note color";
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  expect(input?.value).toBe("#00df50");
  const colors = host.querySelectorAll<HTMLInputElement>("input[type=color]");
  expect(colors[0]?.value).toBe("#ffffff");
  act(() => {
    if (!input) throw new Error("Expected the played note color control");
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!descriptor?.set) throw new Error("Expected the native color value setter");
    descriptor.set.call(input, "#123456");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(changed).toHaveBeenLastCalledWith({ playedNoteColor: "#123456" });
  expect(colors[0]?.value).toBe("#ffffff");
});

it.each(["ru", "en"] as const)("changes staff and tab sizes independently in %s", (language) => {
  setInterfaceLanguage(language);
  const changed = vi.fn();
  act(() => {
    root.render(
      <StaffSettings
        hasScore
        prefs={{ ...DEFAULT_STAFF_PREFS, zoom: 1.5, tabsZoom: 0.8 }}
        onChange={changed}
      />
    );
  });
  const staff = language === "ru" ? "Увеличить нотный стан" : "Make staff larger";
  const tabs = language === "ru" ? "Уменьшить пианинные табы" : "Make piano tabs smaller";
  const click = (name: string) => {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="' + name + '"]');
    if (!button) throw new Error("Missing notation scale control");
    act(() => {
      button.click();
    });
  };
  expect(host.textContent).toContain("150%");
  expect(host.textContent).toContain("80%");
  click(staff);
  expect(changed).toHaveBeenLastCalledWith({ zoom: 1.6 });
  click(tabs);
  expect(changed).toHaveBeenLastCalledWith({ tabsZoom: 0.7 });
});

it.each([
  { zoom: 0.5, tabsZoom: 2, disabled: ["Уменьшить нотный стан", "Увеличить пианинные табы"] },
  { zoom: 2, tabsZoom: 0.5, disabled: ["Увеличить нотный стан", "Уменьшить пианинные табы"] }
])("bounds both notation controls independently at %j", ({ zoom, tabsZoom, disabled }) => {
  const changed = vi.fn();
  act(() => {
    root.render(
      <StaffSettings
        hasScore
        prefs={{ ...DEFAULT_STAFF_PREFS, zoom, tabsZoom }}
        onChange={changed}
      />
    );
  });
  for (const name of disabled) {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="' + name + '"]');
    expect(button?.disabled).toBe(true);
    button?.click();
  }
  expect(changed).not.toHaveBeenCalled();
});

it.each(["ru", "en"] as const)("changes only lesson notation scale by 5%% in %s", (language) => {
  setInterfaceLanguage(language);
  const changed = vi.fn();
  act(() => {
    root.render(
      <StaffSettings
        hasScore
        prefs={{ ...DEFAULT_STAFF_PREFS, zoom: 0.8, tabsZoom: 1.2, lessonZoom: 1.5 }}
        onChange={changed}
      />
    );
  });
  const label = language === "ru" ? "Масштаб нотного стана в уроках" : "Lesson staff scale";
  const smaller = language === "ru" ? "Уменьшить ноты в уроке" : "Make lesson notes smaller";
  const larger = language === "ru" ? "Увеличить ноты в уроке" : "Make lesson notes larger";
  expect(host.textContent).toContain(label);
  const decrease = host.querySelector<HTMLButtonElement>(`button[aria-label="${smaller}"]`);
  const increase = host.querySelector<HTMLButtonElement>(`button[aria-label="${larger}"]`);
  expect(decrease?.closest(".setting")?.textContent).toContain("150%");
  act(() => decrease?.click());
  expect(changed).toHaveBeenLastCalledWith({ lessonZoom: 1.45 });
  act(() => increase?.click());
  expect(changed).toHaveBeenLastCalledWith({ lessonZoom: 1.55 });
  expect(host.textContent).toContain("80%");
  expect(host.textContent).toContain("120%");
});

it.each(["ru", "en"] as const)(
  "bounds lesson controls in %s without changing other scales",
  (language) => {
    setInterfaceLanguage(language);
    const changed = vi.fn();
    const labels =
      language === "ru"
        ? ["Уменьшить ноты в уроке", "Увеличить ноты в уроке"]
        : ["Make lesson notes smaller", "Make lesson notes larger"];
    for (const [index, lessonZoom] of [0.5, 2].entries()) {
      act(() => {
        root.render(
          <StaffSettings
            hasScore
            prefs={{ ...DEFAULT_STAFF_PREFS, lessonZoom }}
            onChange={changed}
          />
        );
      });
      const label = labels[index];
      if (!label) throw new Error("Missing lesson scale bound label");
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button?.disabled).toBe(true);
      act(() => button?.click());
    }
    expect(changed).not.toHaveBeenCalled();
  }
);

it.each(["ru", "en"] as const)(
  "offers lesson scale even when the current song has no score in %s",
  (language) => {
    setInterfaceLanguage(language);
    const changed = vi.fn();
    act(() => {
      root.render(
        <StaffSettings hasScore={false} prefs={DEFAULT_STAFF_PREFS} onChange={changed} />
      );
    });
    const group = language === "ru" ? "Размер и прокрутка" : "Size and scrolling";
    const label = language === "ru" ? "Масштаб нотного стана в уроках" : "Lesson staff scale";
    expect(host.querySelector(`section[aria-label="${group}"]`)?.textContent).toContain(label);
    expect(host.querySelectorAll("button")).toHaveLength(2);
    expect(host.querySelector("input")).toBeNull();
    const larger = language === "ru" ? "Увеличить ноты в уроке" : "Make lesson notes larger";
    act(() => host.querySelector<HTMLButtonElement>(`button[aria-label="${larger}"]`)?.click());
    expect(changed).toHaveBeenLastCalledWith({ lessonZoom: 1.55 });
  }
);
