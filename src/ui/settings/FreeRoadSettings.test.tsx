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
    ["0.25", "8", "0.05"],
    ["0", "20", "0.05"],
    ["0.25", "30", "0.05"]
  ]);
  expect(ranges[0]?.getAttribute("aria-label")).toBe(
    locale === "ru" ? "Высота горизонта, м" : "Horizon height, m"
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
  const distance = ranges[1];
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!distance || !descriptor?.set) throw new Error("Expected distance slider and native setter");
  act(() => {
    descriptor.set?.call(distance, "7.5");
    distance.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ distance: 7.5 });
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
    for (const target of ["height", "distance", "width", "shape"]) {
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
