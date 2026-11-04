// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonActionAnchor } from "./useLessonActionAnchor";

let host: HTMLDivElement;
let root: Root;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
const observe = vi.fn(),
  unobserve = vi.fn(),
  disconnect = vi.fn();
function Harness() {
  const content = useRef<HTMLDivElement>(null);
  useLessonActionAnchor(content);
  return (
    <div className="lesson-workspace__content" ref={content}>
      <footer className="lesson-workspace__response">
        <button>Play</button>
        <div className="lesson-workspace__answer" />
      </footer>
      <div className="lesson-workspace__body">
        <div className="lesson-workspace__score">
          <div className="staff">
            <div className="staff-page">
              <div className="backend">
                <svg />
              </div>
            </div>
            <div className="staff-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}
function required<T>(value: T | null): T {
  if (value === null) throw new Error("Missing fixture element");
  return value;
}
function element(selector: string) {
  return required(host.querySelector<HTMLElement>(selector));
}
function rect(node: Element, x: number, y: number, width: number, height: number) {
  return vi.spyOn(node, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, width, height));
}
async function setup() {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
  const content = element(".lesson-workspace__content"),
    body = element(".lesson-workspace__body"),
    rail = element("footer"),
    svg = required(host.querySelector("svg"));
  rect(content, 10, 100, 1900, 600);
  rect(body, 166, 100, 1588, 600);
  rect(rail, 10, 100, 140, 200);
  const scoreRect = rect(svg, 800, 250, 330, 300);
  content.style.columnGap = "12px";
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
  });
  return { content, body, rail, svg, scoreRect };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  observe.mockClear();
  unobserve.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }
  );
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("lesson controls beside engraved notation", () => {
  it("uses the actual short score edge while leaving its full-width viewport intact", async () => {
    const { content, body, rail, svg } = await setup();
    expect(content.dataset.lessonActionAnchor).toBe("true");
    const left = Number.parseFloat(content.style.getPropertyValue("--lesson-actions-left"));
    const top = Number.parseFloat(content.style.getPropertyValue("--lesson-actions-top"));
    expect(
      content.getBoundingClientRect().left + left + rail.getBoundingClientRect().width + 12
    ).toBe(svg.getBoundingClientRect().left);
    expect(top + rail.getBoundingClientRect().height / 2).toBe(300);
    expect(body.style.width).toBe("");
    expect(svg.getAttribute("width")).toBeNull();
    expect(observe).toHaveBeenCalledWith(svg);
  });
  it("returns controls to the reserved margin when a wide measure reaches the viewport edge", async () => {
    const { content, body, rail, scoreRect } = await setup();
    scoreRect.mockReturnValue(new DOMRect(166, 130, 1588, 500));
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });
    const left = Number.parseFloat(content.style.getPropertyValue("--lesson-actions-left"));
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThan(8);
    expect(
      content.getBoundingClientRect().left + left + rail.getBoundingClientRect().width
    ).toBeLessThan(body.getBoundingClientRect().left);
    expect(content.style.width).toBe("");
  });
  it("follows a scrolled score and clears the anchor for mobile and answer choices", async () => {
    const { content, body, scoreRect } = await setup();
    const initial = content.style.getPropertyValue("--lesson-actions-left");
    scoreRect.mockReturnValue(new DOMRect(650, 250, 330, 300));
    await act(async () => {
      body.dispatchEvent(new Event("scroll"));
      await Promise.resolve();
    });
    expect(content.style.getPropertyValue("--lesson-actions-left")).not.toBe(initial);
    media.matches = false;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });
    expect(content.dataset.lessonActionAnchor).toBeUndefined();
    expect(content.style.getPropertyValue("--lesson-actions-left")).toBe("");
    media.matches = true;
    await act(async () => {
      element(".lesson-workspace__answer").append(document.createElement("button"));
      await Promise.resolve();
    });
    expect(content.dataset.lessonActionAnchor).toBeUndefined();
  });

  it("follows a late page transform without observing playback cursor style changes", async () => {
    const { content, scoreRect } = await setup();
    const before = Number.parseFloat(content.style.getPropertyValue("--lesson-actions-left"));
    scoreRect.mockReturnValue(new DOMRect(1000, 250, 330, 300));
    await act(async () => {
      element(".staff-page").style.transform = "translateX(200px)";
      await Promise.resolve();
    });
    expect(Number.parseFloat(content.style.getPropertyValue("--lesson-actions-left"))).toBe(
      before + 200
    );
    const reads = scoreRect.mock.calls.length;
    await act(async () => {
      element(".staff-cursor").style.transform = "translate(100px, 10px)";
      await Promise.resolve();
    });
    expect(scoreRect.mock.calls).toHaveLength(reads);
  });

  it("disconnects layout subscriptions on unmount", async () => {
    await setup();
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    root = createRoot(host);
  });
});
