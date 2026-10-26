// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { GameDialog } from "./GameDialog";
import { LessonDetails } from "./LessonDetails";
import { WindowViewMemory } from "./windowViewMemory";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function details(id: string) {
  const element = host.querySelector<HTMLDetailsElement>(`[data-window-detail="${id}"]`);
  if (!element) throw new Error("Missing disclosure");
  return element;
}
async function toggle(element: HTMLDetailsElement, open: boolean) {
  await act(async () => {
    element.open = open;
    element.dispatchEvent(new Event("toggle"));
    await Promise.resolve();
  });
}

describe("optional lesson information", () => {
  it("mounts optional content only on request and localizes the summary", async () => {
    const built = vi.fn(),
      action = vi.fn();
    function Content() {
      built();
      return <button onClick={action}>Existing lesson action</button>;
    }
    await act(async () => {
      await Promise.resolve();
      root.render(
        <LessonDetails kind="guide" id="guide">
          <Content />
        </LessonDetails>
      );
    });
    expect(built).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Как выполнять задание");
    await toggle(details("guide"), true);
    expect(built).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    await toggle(details("guide"), false);
    expect(host.querySelector("button")).toBeNull();
    expect(action).not.toHaveBeenCalled();
    setInterfaceLanguage("en");
    await act(async () => {
      await Promise.resolve();
      root.render(
        <LessonDetails kind="guide" id="guide">
          <Content />
        </LessonDetails>
      );
    });
    expect(host.textContent).toContain("How to do this exercise");
  });

  it("restores lazy outer content before nested details and scroll", async () => {
    const memory = new WindowViewMemory();
    const built = vi.fn();
    function History() {
      built();
      return (
        <details data-window-detail="old-inner">
          <summary>Existing history</summary>
          <p data-history>Old result</p>
        </details>
      );
    }
    function Shell() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button
            data-reopen
            onClick={() => {
              setOpen(true);
            }}
          >
            Open
          </button>
          {open && (
            <GameDialog
              open
              title="Fixture"
              memory={memory}
              onClose={() => {
                setOpen(false);
              }}
            >
              <LessonDetails kind="progress" id="outer">
                <History />
              </LessonDetails>
            </GameDialog>
          )}
        </>
      );
    }
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
      this: HTMLElement
    ) {
      return this.closest("dialog")?.open &&
        this.querySelector(
          '[data-window-detail="outer"][open] [data-window-detail="old-inner"][open]'
        )
        ? 1600
        : 200;
    });
    await act(async () => {
      await Promise.resolve();
      root.render(<Shell />);
    });
    expect(built).not.toHaveBeenCalled();
    await toggle(details("outer"), true);
    details("old-inner").open = true;
    await toggle(details("outer"), false);
    expect(host.querySelector("[data-history]")).toBeNull();
    await toggle(details("outer"), true);
    expect(details("old-inner").open).toBe(true);
    const body = host.querySelector<HTMLDivElement>(".game-dialog__body");
    if (!body) throw new Error("Missing window body");
    body.scrollTop = 900;
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click();
    });
    expect(host.querySelector("dialog")).toBeNull();
    expect(memory.detailOpen("body", "outer")).toBe(true);
    expect(memory.detailOpen("body", "old-inner")).toBe(true);
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-reopen]")?.click();
    });
    expect(details("outer").open).toBe(true);
    expect(details("old-inner").open).toBe(true);
    expect(host.querySelector<HTMLDivElement>(".game-dialog__body")?.scrollTop).toBe(900);
    expect(host.querySelector("[data-history]")).not.toBeNull();
    await toggle(details("outer"), false);
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click();
    });
    expect(memory.detailOpen("body", "outer")).toBe(false);
    expect(memory.detailOpen("body", "old-inner")).toBe(true);
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>("[data-reopen]")?.click();
    });
    expect(details("outer").open).toBe(false);
    expect(host.querySelector("[data-history]")).toBeNull();
    await toggle(details("outer"), true);
    expect(details("old-inner").open).toBe(true);
  });
});
