// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { SettingsTransport } from "./SettingsTransport";

let host: HTMLDivElement;
let root: Root;
const toggle = vi.fn();
function button() {
  const control = host.querySelector("button");
  if (!control) throw new Error("Missing settings transport button");
  return control;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  toggle.mockReset();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});
async function render(props: Partial<Parameters<typeof SettingsTransport>[0]> = {}) {
  await act(async () => {
    root.render(
      <SettingsTransport
        playing={false}
        countdown={null}
        loading={false}
        blocked={false}
        onToggle={toggle}
        {...props}
      />
    );
    await Promise.resolve();
  });
}
it("offers an accessible play button without requiring another settings tab", async () => {
  await render();
  const control = button();
  expect(control.getAttribute("aria-label")).toBe("Играть");
  expect(control.disabled).toBe(false);
  control.click();
  expect(toggle).toHaveBeenCalledOnce();
});
it("keeps count-in cancellation and pause available while audio or input is blocked", async () => {
  await render({ countdown: 2, loading: true, blocked: true });
  expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Отменить отсчёт");
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(host.querySelector("[role=status]")?.getAttribute("aria-label")).toBe("До начала: 2");
  button().click();
  expect(toggle).toHaveBeenCalledOnce();
  await render({ playing: true, loading: true, blocked: true });
  expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Пауза");
  expect(host.querySelector("button")?.disabled).toBe(false);
});
it("disables unsupported start and localizes the new controls in English", async () => {
  setInterfaceLanguage("en");
  await render({ blocked: true });
  expect(host.querySelector("[role=group]")?.getAttribute("aria-label")).toBe(
    "Song controls in settings"
  );
  expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Play");
  expect(host.querySelector("button")?.disabled).toBe(true);
  button().click();
  expect(toggle).not.toHaveBeenCalled();
  await render({ countdown: 3 });
  expect(host.querySelector("[role=status]")?.getAttribute("aria-label")).toBe("Starts in: 3");
});

it("offers cancellation without showing a zero-second count while sound prepares", async () => {
  await render({ countdown: 0, loading: true, blocked: true });
  expect(button().getAttribute("aria-label")).toBe("Отменить запуск");
  expect(button().disabled).toBe(false);
  expect(host.querySelector("[role=status]")).toBeNull();
  button().click();
  expect(toggle).toHaveBeenCalledOnce();
});
