// @vitest-environment happy-dom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsTab } from "./SettingsPanel";

// Native dialog visibility is browser-owned; exercise real section navigation.
vi.mock("./GameDialog", () => ({
  GameDialog: ({ children, onClose }: { children: ReactNode; onClose: () => void }) => (
    <section>
      <button type="button" aria-label="Закрыть" onClick={onClose} />
      {children}
    </section>
  )
}));

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const tabs: readonly SettingsTab[] = [
  { id: "game", title: "Игра", content: <p>Игра: содержимое</p> },
  { id: "song", title: "Песня", content: <p>Песня: содержимое</p> },
  { id: "timing", title: "Синхронизация", content: <p>Синхронизация: содержимое</p> }
];

async function render(sections = tabs, open = true) {
  await act(async () => {
    await Promise.resolve();
    root.render(<SettingsPanel open={open} onClose={onClose} tabs={sections} />);
  });
}
function tab(index: number) {
  const button = host.querySelectorAll<HTMLButtonElement>("[role=tab]")[index];
  if (!button) throw new Error(`Missing tab: ${String(index)}`);
  return button;
}
async function key(index: number, value: string) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  await act(async () => {
    await Promise.resolve();
    tab(index).dispatchEvent(event);
  });
  return event;
}
function expectSelected(index: number) {
  const selected = tab(index);
  expect(selected.getAttribute("aria-selected")).toBe("true");
  expect(selected.tabIndex).toBe(0);
  expect(host.querySelectorAll("[role=tab][tabindex='0']")).toHaveLength(1);
  const panel = host.querySelector("[role=tabpanel]");
  expect(panel?.getAttribute("aria-labelledby")).toBe(selected.id);
  expect(selected.getAttribute("aria-controls")).toBe(panel?.id);
  expect(panel?.textContent).toBe(`${tabs[index]?.title ?? ""}: содержимое`);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onClose.mockClear();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("settings section navigation", () => {
  it("builds only the visible section and remembers selection while content is absent", async () => {
    const game = vi.fn(() => <p>Игра: содержимое</p>);
    const timing = vi.fn(() => <p>Синхронизация: содержимое</p>);
    const sections: readonly SettingsTab[] = [
      { id: "game", title: "Игра", render: game },
      { id: "timing", title: "Синхронизация", render: timing }
    ];
    await render(sections, false);
    expect(game).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(host.querySelector("[role=tabpanel]")).toBeNull();
    await render(sections);
    expect(game).toHaveBeenCalledOnce();
    expect(timing).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      tab(1).click();
    });
    expect(timing).toHaveBeenCalledOnce();
    game.mockClear();
    timing.mockClear();
    await render(sections, false);
    await render(sections, false);
    expect(game).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    await render(sections);
    expect(game).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledOnce();
    expect(tab(1).getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector("[role=tabpanel]")?.textContent).toBe("Синхронизация: содержимое");
  });

  it("associates the selected tab with its panel and keeps one tab in the tab order", async () => {
    await render();
    expectSelected(0);
    await act(async () => {
      await Promise.resolve();
      tab(1).click();
    });
    expectSelected(1);
  });

  it("moves focus and selection using arrows with wraparound, Home and End", async () => {
    await render();
    tab(0).focus();
    expect((await key(0, "ArrowDown")).defaultPrevented).toBe(true);
    expectSelected(1);
    expect(document.activeElement).toBe(tab(1));
    await key(1, "End");
    expectSelected(2);
    await key(2, "ArrowRight");
    expectSelected(0);
    await key(0, "ArrowUp");
    expectSelected(2);
    await key(2, "ArrowLeft");
    expectSelected(1);
    await key(1, "Home");
    expectSelected(0);
    expect((await key(0, "Tab")).defaultPrevented).toBe(false);
  });

  it("shares selection with the compact native navigation and preserves it when closed", async () => {
    await render();
    const select = host.querySelector<HTMLSelectElement>("select[aria-label='Раздел настроек']");
    if (!select) throw new Error("Missing compact navigation");
    await act(async () => {
      await Promise.resolve();
      select.value = "timing";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expectSelected(2);
    await render(tabs, false);
    await render();
    expectSelected(2);
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[aria-label='Закрыть']")?.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("falls back to an existing section if the selected section disappears", async () => {
    await render();
    await act(async () => {
      await Promise.resolve();
      tab(2).click();
    });
    await render(tabs.slice(0, 2));
    expectSelected(0);
  });
});
