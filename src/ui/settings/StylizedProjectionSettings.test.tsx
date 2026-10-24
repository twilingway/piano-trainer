// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_PROJECTION_PARAMETERS } from "../../render/stylizedProjection";
import { StylizedProjectionSettings } from "./StylizedProjectionSettings";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
});

it.each(["ru", "en"] as const)("keeps radius number and slider in sync in %s", (locale) => {
  setInterfaceLanguage(locale);
  const change = vi.fn();
  const parameters = { ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" as const };
  act(() => {
    root.render(<StylizedProjectionSettings value={parameters} onChange={change} keyboard3d />);
  });
  const number = host.querySelector<HTMLInputElement>(
    '[data-setting-target="projection-horizonRadius"]'
  );
  expect(number?.value).toBe("2");
  expect(number?.getAttribute("aria-label")).toContain(
    locale === "ru" ? "Радиус горизонта" : "Horizon radius"
  );
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!number || !descriptor?.set) throw new Error("Radius number input is missing");
  act(() => {
    descriptor.set?.call(number, "3.5");
    number.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ ...parameters, horizonRadius: 3.5 });
  act(() => {
    root.render(
      <StylizedProjectionSettings
        value={{ ...parameters, horizonRadius: 3.5 }}
        onChange={change}
        keyboard3d
      />
    );
  });
  const range = number.parentElement?.querySelector<HTMLInputElement>('input[type="range"]');
  expect(Number(range?.value)).toBeCloseTo(Math.log10(3.5));
  expect(host.querySelectorAll('input[type="number"]')).toHaveLength(9);
});

it("allows clearing and typing a fractional radius without resetting the draft", () => {
  const change = vi.fn();
  const parameters = { ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" as const };
  act(() => {
    root.render(<StylizedProjectionSettings value={parameters} onChange={change} keyboard3d />);
  });
  const number = host.querySelector<HTMLInputElement>(
    '[data-setting-target="projection-horizonRadius"]'
  );
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!number || !descriptor?.set) throw new Error("Radius number input is missing");
  act(() => {
    number.focus();
  });
  act(() => {
    descriptor.set?.call(number, "");
    number.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(number.value).toBe("");
  expect(change).not.toHaveBeenCalled();
  act(() => {
    descriptor.set?.call(number, "3.25");
    number.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(number.value).toBe("3.25");
  expect(change).toHaveBeenLastCalledWith({ ...parameters, horizonRadius: 3.25 });
});

it("switches to legacy without changing projection parameters", () => {
  const change = vi.fn();
  const parameters = {
    ...DEFAULT_PROJECTION_PARAMETERS,
    mode: "stylizedProjection" as const,
    horizonRadius: 4.2
  };
  act(() => {
    root.render(<StylizedProjectionSettings value={parameters} onChange={change} keyboard3d />);
  });
  const select = host.querySelector<HTMLSelectElement>(
    '[data-setting-target="stylized-projection"]'
  );
  if (!select) throw new Error("Projection selector is missing");
  act(() => {
    select.value = "legacy";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(change).toHaveBeenCalledWith({ ...parameters, mode: "legacy" });
});

it("applies all preset parameters and exposes unsupported keyboard guidance", () => {
  const change = vi.fn();
  act(() => {
    root.render(
      <StylizedProjectionSettings
        value={{ ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" }}
        onChange={change}
        keyboard3d={false}
      />
    );
  });
  expect(host.textContent).toContain("Другие виды сохраняют прежнюю проекцию");
  const flat = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Прямой горизонт"
  );
  act(() => flat?.click());
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: "stylizedProjection", horizonRadius: 10000, version: 1 })
  );
});
