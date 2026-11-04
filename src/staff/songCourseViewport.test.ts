// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { centreLivePosition, createStaffFollow } from "./staffFollow";
import { placeCursorLine } from "./liveCursor";
import { songCourseDensityScale, songCoursePlayhead } from "./songCourseViewport";

afterEach(() => {
  document.body.replaceChildren();
});

describe("four-note course viewport", () => {
  const notes = [360, 550, 740, 930, 1120, 1310].map((x) => ({ x, width: 56 }));
  it.each([1888, 358, 288])(
    "fits the current and three upcoming real noteheads at viewport width %s",
    (width) => {
      const scale = songCourseDensityScale(width, notes);
      const playhead = songCoursePlayhead(width);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1);
      expect(notes[0]?.x ?? 0).toBeGreaterThan(0);
      expect((notes[0]?.x ?? 0) * scale).toBeLessThan(playhead);
      for (let first = 0; first < notes.length; first++) {
        const active = notes[first];
        if (!active) throw new Error("missing note");
        for (const note of notes.slice(first, first + 4)) {
          const center = playhead + (note.x - active.x) * scale;
          expect(center - (note.width * scale) / 2).toBeGreaterThanOrEqual(0);
          expect(center + (note.width * scale) / 2).toBeLessThanOrEqual(width);
        }
      }
      expect(notes[0]?.width ?? 0).toBeGreaterThan(0);
      expect((notes[0]?.width ?? 0) * scale).toBeGreaterThanOrEqual(14);
    }
  );

  it("sets the initial ready position despite fitting SVG width, then follows only changed song beats", () => {
    const host = document.body.appendChild(document.createElement("div"));
    host.className = "lesson-workspace__body";
    host.dataset.songCoursePlayhead = "115.2";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    host.append(svg);
    Object.defineProperty(host, "clientWidth", { value: 288 });
    host.getBoundingClientRect = () => new DOMRect(16, 0, 288, 160);
    svg.getBoundingClientRect = () => new DOMRect(16 + 115.2 - host.scrollLeft, 0, 275, 160);
    const spots = [0, 1, 2, 3].map((beat) => ({ beat, x: 100 + beat * 50, line: 0 }));
    centreLivePosition(host, spots, 0);
    expect(host.scrollLeft).toBeCloseTo(100);
    expect(svg.getBoundingClientRect().left - 16 + 100).toBeCloseTo(115.2);
    const follow = createStaffFollow(host);
    try {
      follow.frame(0, true, true, spots);
      const ready = host.scrollLeft;
      follow.frame(0, true, true, spots);
      expect(host.scrollLeft).toBe(ready);
      follow.frame(0.5, true, true, spots);
      expect(host.scrollLeft).toBeCloseTo(125);
      follow.frame(0.5, true, true, spots);
      expect(host.scrollLeft).toBeCloseTo(125);
      const cursor = host.appendChild(document.createElement("div"));
      placeCursorLine(host, cursor, spots, [{ top: 0, bottom: 100 }], 0.5, { anchorX: 115.2 });
      const x = Number(/translate\(([^p]+)px/.exec(cursor.style.transform)?.[1]);
      expect(x - host.scrollLeft).toBeCloseTo(115.2);
    } finally {
      follow.dispose();
    }
  });
});
