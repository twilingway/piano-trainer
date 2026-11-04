// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GuidedLessonPath } from "./GuidedLessonPath";
import { GuidedCatalog } from "./GuidedCatalog";
import { WindowViewMemory } from "./windowViewMemory";
import { WindowDisclosureContext } from "./windowDisclosureContext";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
let host: HTMLDivElement, root: Root;
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
  vi.unstubAllGlobals();
  setInterfaceLanguage("ru");
});
describe("learning path presentation", () => {
  it("shows a single recommendation, all thirty-three unlocked steps and text-based statuses", async () => {
    const choose = vi.fn();
    await act(async () => {
      await Promise.resolve();
      root.render(<GuidedLessonPath completed={["right-intro"]} onChoose={choose} />);
    });
    expect(host.querySelectorAll("ol button")).toHaveLength(33);
    expect(host.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain("Одна до");
    expect(host.querySelectorAll("button[disabled]")).toHaveLength(0);
    expect(host.textContent).toContain("Выполнено шагов: 1 из 33");
    await act(async () => {
      await Promise.resolve();
      host.querySelector<HTMLButtonElement>(".guided-path__continue")?.click();
    });
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: "beginner-v1-right-1" }));
  });
  it("translates headings, objectives and actions into English", async () => {
    setInterfaceLanguage("en");
    await act(async () => {
      await Promise.resolve();
      root.render(<GuidedLessonPath completed={[]} onChoose={() => undefined} />);
    });
    expect(host.textContent).toContain("Find your first note");
    expect(host.textContent).toContain("Take the first step");
    expect(host.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
  it("does not mount optional catalogs until disclosure and restores an explicitly remembered opening", async () => {
    const heavy = vi.fn();
    function Heavy() {
      heavy();
      return <span>history</span>;
    }
    const memory = new WindowViewMemory();
    const view = (
      <WindowDisclosureContext.Provider value={memory}>
        <GuidedCatalog>
          <Heavy />
        </GuidedCatalog>
      </WindowDisclosureContext.Provider>
    );
    await act(async () => {
      await Promise.resolve();
      root.render(view);
    });
    expect(heavy).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
      const detail = host.querySelector("details");
      if (detail) {
        detail.open = true;
        detail.dispatchEvent(new Event("toggle", { bubbles: true }));
      }
    });
    expect(host.textContent).toContain("history");
    memory.capture("body", host);
    await act(async () => {
      await Promise.resolve();
      root.render(null);
    });
    await act(async () => {
      await Promise.resolve();
      root.render(view);
    });
    expect(host.querySelector("details")?.open).toBe(true);
    expect(host.textContent).toContain("history");
  });
});
