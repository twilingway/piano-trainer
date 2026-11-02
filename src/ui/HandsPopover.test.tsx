// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { HandsPopover } from "./HandsPopover";

let host: HTMLDivElement;
let root: Root;
const onHands = vi.fn();
const onMode = vi.fn();
const onOpen = vi.fn();
function render(props: Partial<ComponentProps<typeof HandsPopover>> = {}) {
  act(() => {
    root.render(
      <div className="shell-top">
        <div className="topbar">
          <HandsPopover
            hands="right"
            mode="wait"
            onHands={onHands}
            onMode={onMode}
            onOpen={onOpen}
            {...props}
          />
        </div>
        <div className="song-progress" />
      </div>
    );
  });
}
function trigger() {
  const button = host.querySelector<HTMLButtonElement>(".compact-hands > button");
  if (!button) throw new Error("Missing hand button");
  return button;
}
function menu() {
  return host.querySelector<HTMLElement>(".hands-popover");
}
function hand(index: number) {
  const button = menu()?.querySelectorAll<HTMLButtonElement>(".compact-practice__hands > button")[
    index
  ];
  if (!button) throw new Error("Missing hand choice");
  return button;
}
function open() {
  act(() => {
    trigger().click();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 667);
  vi.stubGlobal("innerHeight", 375);
  vi.clearAllMocks();
  setInterfaceLanguage("en");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.matches(".compact-hands > button")) return new DOMRect(617, 110, 34, 34);
    if (this.matches(".song-progress")) return new DOMRect(8, 4, 651, 24);
    if (this.matches(".hands-popover"))
      return new DOMRect(0, 0, 280, Math.min(300, parseFloat(this.style.maxHeight) || 300));
    return new DOMRect();
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the hand shortcut", () => {
  it("opens only mode and hand choices, focuses the selected hand and closes after choosing", () => {
    render();
    open();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(menu()?.querySelectorAll('[role="radiogroup"]')).toHaveLength(2);
    expect(menu()?.querySelectorAll(".compact-practice__hands button")).toHaveLength(4);
    expect(
      menu()?.querySelector(".setting, .compact-practice__hint, .compact-controls__stats")
    ).toBeNull();
    expect(document.activeElement).toBe(hand(1));
    expect(hand(1).getAttribute("aria-checked")).toBe("true");
    act(() => {
      hand(0).click();
    });
    expect(onHands).toHaveBeenCalledWith("left");
    expect(menu()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps mode changes open and disables mode choices while listening", () => {
    render();
    open();
    act(() => {
      menu()?.querySelector<HTMLButtonElement>(".segmented button:nth-child(2)")?.click();
    });
    expect(onMode).toHaveBeenCalledWith("tempo");
    expect(menu()).not.toBeNull();
    render({ hands: "listen" });
    const modes = menu()?.querySelectorAll<HTMLButtonElement>(".segmented button");
    expect(Array.from(modes ?? [], (button) => button.disabled)).toEqual([true, true]);
    expect(hand(3).getAttribute("aria-checked")).toBe("true");
  });

  it("closes on Escape with focus restored, and on a press outside", () => {
    render();
    open();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    open();
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(menu()).toBeNull();
  });

  it("retains MIDI part choices and closes after choosing a part", () => {
    const onRole = vi.fn();
    render({
      parts: {
        roles: ["melody", "bass"],
        role: "bass",
        onRole,
        accompaniment: true,
        onAccompaniment: vi.fn()
      }
    });
    open();
    expect(document.activeElement).toBe(hand(5));
    act(() => {
      hand(4).click();
    });
    expect(onRole).toHaveBeenCalledWith("melody");
    expect(menu()).toBeNull();
  });

  it("does not open choices for fixed practice", () => {
    render({ disabled: true });
    open();
    expect(trigger().disabled).toBe(true);
    expect(menu()).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("positions left of the trigger, below the timeline and within short viewports", () => {
    render();
    open();
    expect(menu()?.style.right).toBe("58px");
    expect(menu()?.style.top).toBe("67px");
    expect(menu()?.style.maxHeight).toBe("335px");
    vi.stubGlobal("innerHeight", 320);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(menu()?.style.top).toBe("32px");
    expect(menu()?.style.maxHeight).toBe("280px");
    expect(
      Number.parseFloat(menu()?.style.top ?? "") + Number.parseFloat(menu()?.style.maxHeight ?? "")
    ).toBe(312);
  });
});
