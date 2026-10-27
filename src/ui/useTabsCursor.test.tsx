// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabsCursor } from "./useTabsCursor";
import { positionInTabs, type TabRow } from "./pianoTabsLayout";
import { sharedTabsExtent } from "./pianoTabsExtent";

const viewportWidth = 1440;
const centreWidth = 1425;
const origin = centreWidth / 2;
const rows: readonly TabRow[] = [
  {
    startBeat: 0,
    endBeat: 4,
    width: 528.497,
    boundaries: [0, 4],
    offsets: [0, 528.497],
    events: [],
    cursorSpots: [
      { beat: 0, x: 0, line: 0 },
      { beat: 4, x: 546.46, line: 0 }
    ]
  }
];
let host: HTMLDivElement;
let root: Root;
let beat: number;
let now: number;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
let actualScroll: number;
let maximumScroll: number;

function Harness({
  follow = true,
  centered = true
}: {
  readonly follow?: boolean;
  readonly centered?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTabsCursor(ref, rows, 0, () => beat, follow, true, centreWidth, centered);
  return (
    <div ref={ref} className="test-tabs-scroll">
      <div className="piano-tabs__system">
        <div className="piano-tabs__grid">
          <span className="piano-tabs__note" data-start="0" data-end="4" />
          <div className="piano-tabs__cursor" />
        </div>
      </div>
    </div>
  );
}

function scroller(): HTMLElement {
  const element = host.querySelector<HTMLElement>(".test-tabs-scroll");
  if (!element) throw new Error("Missing tab scroller");
  return element;
}
function cursorX(): number {
  const cursor = host.querySelector<HTMLElement>(".piano-tabs__cursor");
  return Number(cursor?.style.transform.match(/translateX\(([^p]+)px\)/)?.[1]);
}
function screenX(): number {
  return origin + cursorX() - actualScroll;
}
function draw(timestamp: number): void {
  now = timestamp;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(timestamp);
}
async function render(follow = true, centered = true): Promise<void> {
  await act(async () => {
    root.render(<Harness follow={follow} centered={centered} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  beat = 0;
  now = 0;
  frameId = 0;
  actualScroll = 0;
  maximumScroll =
    sharedTabsExtent(rows, { svgOffsetX: origin, viewportWidth: centreWidth }, viewportWidth, true)
      .width - viewportWidth;
  frames = new Map();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return new DOMRect(
      this.classList.contains("piano-tabs__grid") ? 11 + origin - actualScroll : 11,
      0,
      viewportWidth,
      100
    );
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  expect(frames.size).toBe(0);
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function roundScroll(): void {
  Object.defineProperty(scroller(), "scrollLeft", {
    configurable: true,
    get: () => actualScroll,
    set: (value: number) => {
      actualScroll = Math.round(Math.max(0, Math.min(maximumScroll, value)));
    }
  });
}

describe("tab cursor with browser-rounded scrolling", () => {
  it("holds the same centre for 60 fractional frames, pause, seek and the overhanging final anchor", async () => {
    await render();
    roundScroll();
    for (let index = 0; index < 60; index++) {
      beat = index * 0.063 + 0.017;
      draw(index * 16);
      expect(screenX()).toBeCloseTo(origin, 8);
    }
    draw(1000);
    draw(1016);
    draw(1032);
    expect(screenX()).toBeCloseTo(origin, 8);
    beat = 0.123;
    draw(1048);
    expect(screenX()).toBeCloseTo(origin, 8);
    beat = 4;
    draw(1064);
    draw(1080);
    expect(actualScroll).toBe(546);
    expect(screenX()).toBeCloseTo(origin, 8);
    expect(rows[0]?.width).toBe(528.497);
    expect(rows[0]?.cursorSpots?.at(-1)?.x).toBe(546.46);
  });
  it("removes correction during manual pause/drag and resumes after release without advancing the clock", async () => {
    await render();
    roundScroll();
    beat = 0.123;
    draw(16);
    const rawX = positionInTabs(rows, beat)?.x ?? 0;
    scroller().dispatchEvent(new Event("pointerdown"));
    scroller().scrollLeft = rawX;
    draw(5016);
    expect(cursorX()).toBe(rawX);
    window.dispatchEvent(new Event("pointerup"));
    draw(7500);
    expect(cursorX()).toBe(rawX);
    draw(7532);
    draw(7548);
    expect(screenX()).toBeCloseTo(origin, 8);
    expect(beat).toBe(0.123);
  });
  it("preserves disabled follow and existing wrapped horizontal scrolling without new correction", async () => {
    await render(false);
    roundScroll();
    beat = 0.123;
    scroller().scrollLeft = 10;
    draw(16);
    expect(actualScroll).toBe(10);
    expect(cursorX()).toBe(positionInTabs(rows, beat)?.x);
    await render(true, false);
    draw(32);
    expect(actualScroll).toBe(Math.round(positionInTabs(rows, beat)?.x ?? 0));
    expect(cursorX()).toBe(positionInTabs(rows, beat)?.x);
  });
  it("does not hide a real scroll-range clamp behind cursor compensation", async () => {
    await render();
    roundScroll();
    maximumScroll = 20;
    beat = 1;
    draw(16);
    expect(actualScroll).toBe(20);
    expect(cursorX()).toBe(positionInTabs(rows, beat)?.x);
    expect(screenX() - origin).toBeGreaterThan(1);
  });
});
