// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { courseDrawingBounds, useSongCourseStartPosition } from "./useSongCourseStartPosition";
let root: Root, host: HTMLDivElement, score: HTMLDivElement, svg: SVGSVGElement;
let keyboardTop = 650;
let resize: () => void = () => undefined;
const disconnect = vi.fn();
function Probe({ open = true }: { readonly open?: boolean }) {
  const ref = useRef<HTMLDivElement>(null),
    position = useSongCourseStartPosition(open, ref);
  return <div ref={ref} data-position={JSON.stringify(position)} />;
}
async function render(open = true) {
  await act(async () => {
    await Promise.resolve();
    root.render(<Probe open={open} />);
  });
}
function position(): { top: number; left: number; size: number; overKeyboard: boolean } {
  return JSON.parse(
    host.querySelector("[data-position]")?.getAttribute("data-position") ?? "null"
  ) as { top: number; left: number; size: number; overKeyboard: boolean };
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {
        return undefined;
      }
      disconnect = disconnect;
    }
  );
  host = document.body.appendChild(document.createElement("div"));
  host.className = "workspace-main";
  host.innerHTML =
    '<section class="song-course-lesson"><div class="song-course-lesson__score"><svg><g/></svg></div><div id="probe"/></section><div class="lanes"/>';
  score = requireValue(host.querySelector<HTMLDivElement>(".song-course-lesson__score"));
  svg = requireValue(score.querySelector("svg"));
  const keyboard = requireValue(host.querySelector<HTMLElement>(".lanes"));
  score.getBoundingClientRect = () => new DOMRect(0, 100, 390, 550);
  svg.getBoundingClientRect = () => new DOMRect(20, 200, 350, 250);
  svg.getBBox = () => new DOMRect(0, 0, 350, 180);
  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 20, f: 200 }) as DOMMatrix;
  keyboardTop = 650;
  keyboard.getBoundingClientRect = () => new DOMRect(0, keyboardTop, 390, 844 - keyboardTop);
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  root = createRoot(requireValue(host.querySelector("#probe")));
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});
it("measures actual drawn SVG bounds including labels rather than its page size", () => {
  expect(courseDrawingBounds(score)).toEqual({ left: 20, top: 200, right: 370, bottom: 380 });
});
it("updates on keyboard resize without a frame loop and cleans observers when closed", async () => {
  await render();
  const old = position();
  expect(old.top).toBeGreaterThan(380);
  expect(old.overKeyboard).toBe(false);
  keyboardTop = 390;
  await act(async () => {
    await Promise.resolve();
    resize();
  });
  expect(position().overKeyboard).toBe(true);
  expect(position().top).toBeGreaterThanOrEqual(390);
  await render(false);
  expect(disconnect).toHaveBeenCalledOnce();
});
it("updates browser zoom and orientation on resize while preserving SVG geometry", async () => {
  await render();
  const before = svg.outerHTML;
  svg.getScreenCTM = () => ({ a: 0.8, b: 0, c: 0, d: 0.8, e: 20, f: 100 }) as DOMMatrix;
  await act(async () => {
    await Promise.resolve();
    window.dispatchEvent(new Event("resize"));
  });
  expect(position().top).toBeGreaterThan(244);
  expect(svg.outerHTML).toBe(before);
});

function requireValue<T>(value: T | null): T {
  if (value === null) throw new Error("missing fixture value");
  return value;
}
