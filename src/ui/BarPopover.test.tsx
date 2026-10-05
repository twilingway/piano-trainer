// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BarPopover } from "./BarPopover";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    await Promise.resolve();
    root.render(
      <BarPopover label="Текст" summary="Текст ▾">
        <select aria-label="Язык текста">
          <option>Русский</option>
        </select>
      </BarPopover>
    );
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function details() {
  const element = host.querySelector("details");
  if (!element) throw new Error("No popover");
  return element;
}
async function open() {
  await act(async () => {
    details().open = true;
    details().dispatchEvent(new Event("toggle"));
    await Promise.resolve();
  });
  host.querySelector("select")?.focus();
}

describe("a window of the bar", () => {
  it("closes on a press outside and leaves no focus in its list", async () => {
    await open();
    expect(document.activeElement?.tagName).toBe("SELECT");
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      details().dispatchEvent(new Event("toggle"));
      await Promise.resolve();
    });
    expect(details().open).toBe(false);
    expect(document.activeElement?.tagName).not.toBe("SELECT");
  });

  it("closes on Escape", async () => {
    await open();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });
    expect(details().open).toBe(false);
  });

  it("stays open for a press inside", async () => {
    await open();
    await act(async () => {
      host
        .querySelector("select")
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });
    expect(details().open).toBe(true);
  });
});
