// @vitest-environment happy-dom
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsTab } from "./SettingsPanel";

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
  setInterfaceLanguage("ru");
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
  vi.restoreAllMocks();
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

it.each(["disabled", "missing"] as const)(
  "focuses and highlights a safe destination for a %s MIDI target without changing its value",
  async (condition) => {
    const changed = vi.fn();
    const sections: readonly SettingsTab[] = [
      {
        id: "help",
        title: "Help",
        render: (navigate) => (
          <button
            type="button"
            data-help-target="midi-output"
            onClick={() => {
              navigate("midi", "midi-output");
            }}
          >
            MIDI output
          </button>
        )
      },
      {
        id: "midi",
        title: "Piano",
        content: (
          <section className="settings-group">
            <label>
              MIDI output
              {condition === "disabled" && (
                <select data-setting-target="midi-output" value="piano" disabled onChange={changed}>
                  <option value="piano">Piano</option>
                </select>
              )}
            </label>
          </section>
        )
      }
    ];
    await render(sections);
    const help = host.querySelector<HTMLButtonElement>("[data-help-target]");
    await act(async () => {
      help?.click();
      await Promise.resolve();
    });
    const destination =
      condition === "disabled"
        ? host.querySelector("[role=tabpanel] label")
        : host.querySelector("[role=tabpanel]");
    expect(document.activeElement).toBe(destination);
    expect(destination?.getAttribute("data-setting-highlight")).toBe("true");
    expect(host.querySelector<HTMLSelectElement>("[data-setting-target]")?.value).toBe(
      condition === "disabled" ? "piano" : undefined
    );
    expect(changed).not.toHaveBeenCalled();
  }
);

describe("settings presentation memory", () => {
  function panel() {
    const element = host.querySelector<HTMLDivElement>("[role=tabpanel]");
    if (!element) throw new Error("Missing settings panel");
    return element;
  }
  function detail() {
    const element = panel().querySelector("details");
    if (!element) throw new Error("Missing disclosure");
    return element;
  }
  function layout() {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      if (!this.closest("dialog")?.open) return 0;
      return this.querySelector("details[open]") ? 1400 : 300;
    });
  }
  const sections: readonly SettingsTab[] = [
    {
      id: "view",
      title: "Вид",
      content: (
        <details data-window-detail="view:explanation">
          <summary>View explanation</summary>
          <p>Long content</p>
        </details>
      )
    },
    {
      id: "piano",
      title: "Пианино",
      content: (
        <details data-window-detail="piano:explanation">
          <summary>Piano explanation</summary>
          <p>Other long content</p>
        </details>
      )
    }
  ];
  it("remembers independent tab scroll and disclosures before measuring, including external close", async () => {
    layout();
    await render(sections);
    detail().open = true;
    panel().scrollTop = 650;
    await act(async () => {
      await Promise.resolve();
      tab(1).click();
    });
    expect(panel().scrollTop).toBe(0);
    expect(detail().open).toBe(false);
    detail().open = true;
    panel().scrollTop = 420;
    await act(async () => {
      await Promise.resolve();
      tab(0).click();
    });
    expect(detail().open).toBe(true);
    expect(panel().scrollTop).toBe(650);
    await act(async () => {
      await Promise.resolve();
      tab(1).click();
    });
    expect(detail().open).toBe(true);
    expect(panel().scrollTop).toBe(420);
    await render(sections, false);
    expect(host.querySelector("[role=tabpanel]")).toBeNull();
    await render(sections);
    expect(tab(1).getAttribute("aria-selected")).toBe("true");
    expect(detail().open).toBe(true);
    expect(panel().scrollTop).toBe(420);
    detail().open = false;
    panel().scrollTop = 40;
    await render(sections, false);
    await render(sections);
    expect(detail().open).toBe(false);
    expect(panel().scrollTop).toBe(40);
  });
  it("ignores missing disclosures and clamps a shorter changed section", async () => {
    layout();
    await render(sections);
    detail().open = true;
    panel().scrollTop = 950;
    await render(sections, false);
    const changed = [{ id: "view", title: "Вид", content: <p>Short available content</p> }];
    await render(changed);
    expect(panel().scrollTop).toBe(100);
    expect(panel().querySelector("details")).toBeNull();
  });
  it("lets explicit help focus override saved scroll and remembers the new destination", async () => {
    layout();
    const changed = vi.fn();
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
      this: HTMLElement
    ) {
      const container = this.closest<HTMLElement>("[role=tabpanel]");
      if (container) container.scrollTop = 95;
    });
    const help: readonly SettingsTab[] = [
      {
        id: "help",
        title: "Помощь",
        render: (navigate) => (
          <button
            data-help-target="setting"
            onClick={() => {
              navigate("view", "setting");
            }}
          >
            Go to setting
          </button>
        )
      },
      {
        id: "view",
        title: "Вид",
        content: (
          <details data-window-detail="view:setting">
            <summary>More settings</summary>
            <input data-setting-target="setting" value="unchanged" onChange={changed} />
          </details>
        )
      }
    ];
    await render(help);
    await act(async () => {
      await Promise.resolve();
      tab(1).click();
    });
    detail().open = true;
    panel().scrollTop = 780;
    detail().open = false;
    await act(async () => {
      await Promise.resolve();
      tab(0).click();
    });
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-help-target]")?.click();
    });
    const control = panel().querySelector("input");
    expect(document.activeElement).toBe(control);
    expect(detail().open).toBe(true);
    expect(panel().scrollTop).toBe(95);
    expect(control?.value).toBe("unchanged");
    expect(changed).not.toHaveBeenCalled();
    scroll.mockClear();
    await render(help, false);
    await render(help);
    expect(panel().scrollTop).toBe(95);
    expect(scroll).not.toHaveBeenCalled();
  });
  it("keeps memory private to each settings instance", async () => {
    layout();
    const both = async (open: boolean) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <>
            <SettingsPanel open={open} tabs={sections} onClose={onClose} />
            <SettingsPanel open={open} tabs={sections} onClose={onClose} />
          </>
        );
      });
    };
    await both(true);
    const containers = host.querySelectorAll<HTMLElement>("[role=tabpanel]");
    const first = containers[0],
      second = containers[1];
    if (!first || !second) throw new Error("Missing settings instances");
    const firstDetails = first.querySelector("details");
    if (!firstDetails) throw new Error("Missing first disclosure");
    firstDetails.open = true;
    first.scrollTop = 700;
    second.scrollTop = 30;
    await both(false);
    await both(true);
    const restored = host.querySelectorAll<HTMLElement>("[role=tabpanel]");
    expect(restored[0]?.scrollTop).toBe(700);
    expect(restored[0]?.querySelector("details")?.open).toBe(true);
    expect(restored[1]?.scrollTop).toBe(30);
    expect(restored[1]?.querySelector("details")?.open).toBe(false);
  });
  it("renders controls only in the open fixed header, never inside a tab", async () => {
    const command = vi.fn(),
      built = vi.fn();
    function Controls() {
      built();
      return (
        <button data-transport onClick={command}>
          Play
        </button>
      );
    }
    const withControls = async (open: boolean) => {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <SettingsPanel open={open} tabs={sections} onClose={onClose} controls={<Controls />} />
        );
      });
    };
    await withControls(false);
    expect(built).not.toHaveBeenCalled();
    await withControls(true);
    const control = host.querySelector<HTMLButtonElement>(".game-dialog__actions [data-transport]");
    expect(control).not.toBeNull();
    expect(panel().contains(control)).toBe(false);
    await act(async () => {
      await Promise.resolve();
      control?.click();
    });
    expect(command).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await withControls(false);
    expect(host.querySelector("[data-transport]")).toBeNull();
  });
});
