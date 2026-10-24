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
