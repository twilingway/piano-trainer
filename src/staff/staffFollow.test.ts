// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { placeCursorLine } from "./liveCursor";
import { centreLivePosition, createStaffFollow } from "./staffFollow";

const spots = [
  { beat: 0, x: 80, line: 0 },
  { beat: 3, x: 260, line: 0 },
  { beat: 4, x: 600, line: 0 }
];
const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

function fixture() {
  const host = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const cursor = document.createElement("div");
  host.append(svg, cursor);
  Object.defineProperty(host, "clientWidth", { value: 800 });
  host.getBoundingClientRect = () => new DOMRect(30, 0, 800, 120);
  // Half a viewport before the score, matching the real single-line CSS padding.
  svg.getBoundingClientRect = () => new DOMRect(430 - host.scrollLeft, 0, 2000, 120);
  let time = 0;
  const controller = createStaffFollow(host, () => time);
  disposals.push(() => {
    controller.dispose();
  });
  const frame = (beat: number, follow = true, singleLine = true) => {
    controller.frame(beat, singleLine, follow, spots);
    placeCursorLine(host, cursor, spots, [{ top: 0, bottom: 120 }], beat);
  };
  const cursorX = () =>
    Number(/translate\(([^p]+)px/.exec(cursor.style.transform)?.[1]) - host.scrollLeft;
  return { host, frame, cursorX, time: (value: number) => (time = value), controller };
}

describe("staff cursor following", () => {
  it("centres a paused start/rest, live fractions, seeks and reset without pixel lag", () => {
    const view = fixture();
    for (const beat of [0, 0.25, 1.8, 3, 3.2, 3.95, 1.5, 0]) {
      view.frame(beat);
      expect(view.cursorX()).toBeCloseTo(400, 8);
    }
    const frozen = view.host.scrollLeft;
    view.frame(0);
    expect(view.host.scrollLeft).toBe(frozen);
  });

  it("relayout centres the visible position instead of an OSMD note cursor", () => {
    const { host } = fixture();
    host.scrollLeft = 1200;
    centreLivePosition(host, spots, 1.5);
    expect(host.scrollLeft).toBe(170);
  });

  it("uses the visible panel centre even when a scrollbar gutter reduces client width", () => {
    const view = fixture();
    view.host.getBoundingClientRect = () => new DOMRect(30, 0, 815, 120);
    view.frame(0);
    expect(view.cursorX()).toBe(407.5);
  });

  it("does not replace the reader's scroll while paused or following is disabled", () => {
    const view = fixture();
    view.frame(1);
    view.host.scrollLeft = 1000;
    view.frame(1);
    expect(view.host.scrollLeft).toBe(1000);
    view.frame(2, false);
    expect(view.host.scrollLeft).toBe(1000);
    view.frame(2, true);
    expect(view.cursorX()).toBe(400);
  });

  it("keeps wheel scrolling manual for 2.5 seconds, then resumes without easing lag", () => {
    const view = fixture();
    view.frame(0);
    view.host.dispatchEvent(new WheelEvent("wheel"));
    view.host.scrollLeft = 800;
    view.time(2499);
    view.frame(2);
    expect(view.host.scrollLeft).toBe(800);
    view.time(2500);
    view.frame(2.5);
    expect(view.cursorX()).toBe(400);
  });

  it.each(["pointerup", "pointercancel"])(
    "does not steal a long drag before %s or during its hold",
    (release) => {
      const view = fixture();
      view.frame(0);
      view.host.dispatchEvent(new PointerEvent("pointerdown"));
      view.host.scrollLeft = 800;
      view.time(8000);
      view.frame(2);
      expect(view.host.scrollLeft).toBe(800);
      window.dispatchEvent(new PointerEvent(release));
      view.time(10499);
      view.frame(3);
      expect(view.host.scrollLeft).toBe(800);
      view.time(10500);
      view.frame(3.1);
      expect(view.cursorX()).toBe(400);
    }
  );

  it("leaves wrapped horizontal placement alone and removes gesture listeners on disposal", () => {
    const view = fixture();
    view.host.scrollLeft = 800;
    view.frame(1, true, false);
    expect(view.host.scrollLeft).toBe(800);
    view.controller.dispose();
    view.host.dispatchEvent(new PointerEvent("pointerdown"));
    view.frame(2);
    expect(view.cursorX()).toBe(400);
  });
});
