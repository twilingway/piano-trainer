// @vitest-environment happy-dom
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { afterEach, describe, expect, it, vi } from "vitest";
import { centreLivePosition, createStaffFollow } from "./staffFollow";
import { showDrawing, fitCourseDrawing } from "./courseStaffView";
import { placeCursorLine } from "./liveCursor";
import {
  fitSongCourseLabelBounds,
  fitSongCourseRoom,
  songCourseDensityScale,
  songCoursePlayhead
} from "./songCourseViewport";

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

it.each([false, true])(
  "keeps rendered note names and written fingers inside the course viewport (top overflow=%s)",
  (above) => {
    const body = document.body.appendChild(document.createElement("div"));
    body.className = "lesson-workspace__body";
    const host = body.appendChild(document.createElement("div"));
    host.dataset.songCoursePlayhead = "160";
    const wrapper = host.appendChild(document.createElement("div"));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "128");
    svg.setAttribute("viewBox", "0 0 400 128");
    wrapper.append(svg);
    svg.getBoundingClientRect = () => new DOMRect(20, 104, 400, Number(svg.getAttribute("height")));
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = "B";
    svg.append(label);
    const shift = () => -Number((svg.getAttribute("viewBox") ?? "").split(" ")[1]);
    label.getBoundingClientRect = () => new DOMRect(180, 212 + shift(), 20, 34);
    if (above) {
      const finger = document.createElementNS("http://www.w3.org/2000/svg", "text");
      finger.textContent = "5";
      svg.append(finger);
      finger.getBoundingClientRect = () => new DOMRect(180, 90 + shift(), 12, 20);
    }
    const moved = fitSongCourseLabelBounds(host);
    expect(moved).toBe(above ? 18 : 0);
    for (const text of svg.querySelectorAll("text")) {
      expect(text.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        svg.getBoundingClientRect().top
      );
      expect(text.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        svg.getBoundingClientRect().bottom
      );
    }
    expect(svg.getAttribute("width")).toBe("400");
    expect(
      svg
        .getAttribute("viewBox")
        ?.split(" ")
        .filter((_, index) => index === 0 || index === 2)
    ).toEqual(["0", "400"]);
    showDrawing(host);
    expect(Number.parseFloat(host.style.height)).toBe(svg.getBoundingClientRect().height);
    const fitted = svg.getAttribute("viewBox");
    expect(fitSongCourseLabelBounds(host)).toBe(0);
    expect(svg.getAttribute("viewBox")).toBe(fitted);
  }
);

it("leaves legacy course SVG label geometry unchanged", () => {
  const host = document.body.appendChild(document.createElement("div"));
  host.innerHTML = '<svg width="400" height="128" viewBox="0 0 400 128"><text>B</text></svg>';
  expect(fitSongCourseLabelBounds(host)).toBe(0);
  expect(host.querySelector("svg")?.getAttribute("height")).toBe("128");
});

it.each([80, 110, 260])(
  "uniformly rerenders final ink plus note names into a %spx row before cursor indexing",
  (height) => {
    const room = document.body.appendChild(document.createElement("div"));
    room.className = "song-course-lesson__score";
    Object.defineProperty(room, "clientHeight", { value: height });
    const host = room.appendChild(document.createElement("div"));
    host.dataset.songCoursePlayhead = "160";
    Object.defineProperty(host, "clientWidth", { value: 500 });
    const page = host.appendChild(document.createElement("div"));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = "до";
    svg.append(label);
    page.append(svg);
    svg.getBBox = () => new DOMRect(20, 20, 300, 150);
    svg.getBoundingClientRect = () =>
      new DOMRect(0, 0, Number(svg.getAttribute("width")), Number(svg.getAttribute("height")));
    label.getBoundingClientRect = () => {
      const [, top = 0, width = 1] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
      const scale = Number(svg.getAttribute("width")) / width;
      return new DOMRect(70 * scale, (190 - top) * scale, 20 * scale, 30 * scale);
    };
    const notation = {
      Zoom: 1.5,
      render: vi.fn(() => {
        svg.setAttribute("width", String(400 * notation.Zoom));
        svg.setAttribute("height", String(225 * notation.Zoom));
        svg.setAttribute("viewBox", "0 0 400 225");
      })
    };
    notation.render();
    const draw = () => fitCourseDrawing(host) + fitSongCourseLabelBounds(host);
    const osmd = notation as unknown as OpenSheetMusicDisplay;
    fitSongCourseRoom(osmd, host, draw);
    const frame = svg.getBoundingClientRect();
    expect(frame.height).toBeLessThanOrEqual(height + 0.5);
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.bottom);
    expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(frame.top);
    const [, , unitsWidth = 1, unitsHeight = 1] = (svg.getAttribute("viewBox") ?? "")
      .split(" ")
      .map(Number);
    expect(frame.width / unitsWidth).toBeCloseTo(notation.Zoom);
    expect(frame.height / unitsHeight).toBeCloseTo(notation.Zoom);
    expect(page.style.transform).toBe("");
    const before = notation.Zoom;
    fitSongCourseRoom(osmd, host, draw);
    expect(notation.Zoom).toBeCloseTo(before);
    const cursor = host.appendChild(document.createElement("div"));
    const spots = [0, 1].map((beat) => ({ beat, x: (100 + beat * 100) * notation.Zoom, line: 0 }));
    placeCursorLine(host, cursor, spots, [{ top: 0, bottom: frame.height }], 0.5);
    const cursorX = Number(/translate\(([^p]+)px/.exec(cursor.style.transform)?.[1]);
    expect(cursorX).toBeCloseTo(150 * notation.Zoom);
  }
);

it("preserves legacy manually enlarged notation without an allocated melody row", () => {
  const host = document.body.appendChild(document.createElement("div"));
  host.dataset.songCoursePlayhead = "160";
  const notation = { Zoom: 2, render: vi.fn() };
  const draw = vi.fn(() => 12);
  expect(fitSongCourseRoom(notation as unknown as OpenSheetMusicDisplay, host, draw)).toBe(12);
  expect(notation.render).not.toHaveBeenCalled();
  expect(notation.Zoom).toBe(2);
  expect(draw).toHaveBeenCalledOnce();
});
