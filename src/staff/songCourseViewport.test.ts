// @vitest-environment happy-dom
import { DEFAULT_STAFF_PREFS } from "../app/staffPreferences";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { afterEach, describe, expect, it, vi } from "vitest";
import { centreLivePosition, createStaffFollow } from "./staffFollow";
import { showDrawing, fitCourseDrawing } from "./courseStaffView";
import { placeCursorLine } from "./liveCursor";
import {
  frameSongCourseDrawing,
  songCourseAxisOffset,
  songCourseCursorAnchor,
  positionSongCourseViewport,
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
      // This synthetic wide-spaced fixture only proves fitting; actual OSMD glyph readability is tested separately.
      expect((notes[0]?.width ?? 0) * scale).toBeGreaterThan(0);
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

it("aligns the initial short phrase to the screen center and scrolls its ink under one fixed cursor through the last duration", () => {
  const host = document.body.appendChild(document.createElement("div"));
  host.dataset.songCoursePlayhead = "128";
  Object.defineProperty(host, "clientWidth", { value: 320 });
  const page = host.appendChild(document.createElement("div"));
  page.className = "staff-page";
  page.style.paddingInline = "128px 192px";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  page.append(svg);
  const head = document.createElementNS(svg.namespaceURI, "g");
  head.setAttribute("class", "vf-notehead");
  svg.append(head);
  let width = 280;
  svg.getBoundingClientRect = () =>
    new DOMRect(parseFloat(page.style.paddingInline) - host.scrollLeft, 0, width, 120);
  head.getBoundingClientRect = () => new DOMRect(svg.getBoundingClientRect().left + 90, 60, 20, 10);
  host.getBoundingClientRect = () => new DOMRect(0, 0, 320, 120);
  frameSongCourseDrawing(host);
  expect(host.dataset.songCourseCentered).toBeUndefined();
  expect(Number(host.dataset.songCoursePlayhead)).toBeCloseTo(160);
  expect(page.style.paddingInline).toBe("160px 160px");
  const spots = [0, 1, 2, 3, 4].map((beat) => ({ beat, x: 100 + beat * 45, line: 0 }));
  const cursor = host.appendChild(document.createElement("div"));
  const screenPositions: number[] = [];
  const sourcePositions: number[] = [];
  for (const beat of [0, 0.5, 1, 2, 3, 4]) {
    expect(positionSongCourseViewport(host, spots, beat)).toBe(true);
    expect(host.scrollLeft).toBeCloseTo(100 + beat * 45);
    expect(songCourseCursorAnchor(host, true)).toEqual({ anchorX: 160 });
    placeCursorLine(
      host,
      cursor,
      spots,
      [{ top: 0, bottom: 120 }],
      beat,
      songCourseCursorAnchor(host, true)
    );
    const translated = Number(/translate\(([^p]+)px/.exec(cursor.style.transform)?.[1]);
    screenPositions.push(translated - host.scrollLeft);
    sourcePositions.push(svg.getBoundingClientRect().left);
    const paused = host.scrollLeft;
    positionSongCourseViewport(host, spots, beat);
    expect(host.scrollLeft).toBe(paused);
  }
  expect(screenPositions.every((x) => Math.abs(x - 160) < 1e-6)).toBe(true);
  expect(sourcePositions[0]).toBeCloseTo(60);
  expect(sourcePositions.at(-1)).toBeLessThan(sourcePositions[0] ?? 0);
  expect(svg.getBoundingClientRect().left + width).toBeCloseTo(160);
  width = 900;
  frameSongCourseDrawing(host);
  expect(songCourseCursorAnchor(host, true)).toEqual({ anchorX: 160 });
});

it.each([320, 390, 667, 1076])(
  "keeps the playhead centered and its mask gap available at every manual scale, width %s",
  (width) => {
    for (const scale of [1 / 1.5, 1, 2 / 1.5]) {
      const host = document.body.appendChild(document.createElement("div"));
      host.dataset.songCoursePlayhead = "128";
      Object.defineProperty(host, "clientWidth", { value: width });
      const page = host.appendChild(document.createElement("div"));
      page.className = "staff-page";
      page.innerHTML = '<svg><g class="vf-timesignature"/><g class="vf-notehead"/></svg>';
      const svg = page.querySelector("svg"),
        head = page.querySelector(".vf-notehead"),
        intro = page.querySelector(".vf-timesignature");
      if (!svg || !head || !intro) throw new Error("Missing fixture");
      svg.getBoundingClientRect = () => new DOMRect(0, 0, 900 * scale, 150 * scale);
      head.getBoundingClientRect = () => new DOMRect(210 * scale, 80, 28 * scale, 20 * scale);
      intro.getBoundingClientRect = () => new DOMRect(140 * scale, 20, 60 * scale, 60 * scale);
      frameSongCourseDrawing(host);
      const anchor = Number(host.dataset.songCoursePlayhead);
      const gap = Number(host.dataset.songCourseCursorGap);
      expect(anchor).toBeLessThan(width);
      expect(anchor).toBe(width / 2);
      expect(anchor - gap).toBeGreaterThan(0);
      expect(
        parseFloat(page.style.paddingInline) +
          Number.parseFloat(page.style.paddingInline.split(" ")[1] ?? "0")
      ).toBeCloseTo(width);
    }
  }
);

it("applies 100/150/200 percent relative to the existing default after fitting, without refitting the manual result", () => {
  const sizes: number[] = [];
  for (const requested of [1, DEFAULT_STAFF_PREFS.lessonZoom, 2]) {
    const room = document.body.appendChild(document.createElement("div"));
    room.className = "song-course-lesson__score";
    Object.defineProperty(room, "clientHeight", { value: 120 });
    const host = room.appendChild(document.createElement("div"));
    host.dataset.songCoursePlayhead = "128";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    host.append(svg);
    const notation = {
      Zoom: 1.5,
      render: vi.fn(() => {
        svg.setAttribute("width", String(400 * notation.Zoom));
        svg.setAttribute("height", String(225 * notation.Zoom));
      })
    };
    svg.getBoundingClientRect = () =>
      new DOMRect(0, 0, Number(svg.getAttribute("width")), Number(svg.getAttribute("height")));
    notation.render();
    fitSongCourseRoom(
      notation as unknown as OpenSheetMusicDisplay,
      host,
      () => 0,
      requested / DEFAULT_STAFF_PREFS.lessonZoom
    );
    sizes.push(svg.getBoundingClientRect().width);
    if (requested === 2) expect(svg.getBoundingClientRect().height).toBeGreaterThan(120);
  }
  expect(sizes[0]).toBeCloseTo(((sizes[1] ?? 0) * 2) / 3);
  expect(sizes[2]).toBeCloseTo(((sizes[1] ?? 0) * 4) / 3);
});

it("keeps the cropped SVG time axis in reader pixel coordinates", () => {
  const host = document.body.appendChild(document.createElement("div"));
  host.innerHTML = '<svg viewBox="20 30 400 100" width="600" height="150"></svg>';
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("Missing cropped SVG");
  svg.getBoundingClientRect = () => new DOMRect(40, 50, 600, 150);
  expect(songCourseAxisOffset(host)).toBe(-30);
  svg.setAttribute("viewBox", "0 30 400 100");
  expect(songCourseAxisOffset(host)).toBeCloseTo(0);
});

it("contains 200-percent manual notation in a 159px landscape row without reducing its chosen scale", () => {
  const room = document.body.appendChild(document.createElement("div"));
  room.className = "song-course-lesson__score";
  Object.defineProperty(room, "clientHeight", { value: 159 });
  const host = room.appendChild(document.createElement("div"));
  host.dataset.songCoursePlayhead = "128";
  host.style.overflowY = "auto";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.append(svg);
  const notation = {
    Zoom: 1.5,
    render: vi.fn(() => {
      svg.setAttribute("width", String(600 * notation.Zoom));
      svg.setAttribute("height", String(105 * notation.Zoom));
    })
  };
  svg.getBoundingClientRect = () =>
    new DOMRect(0, 0, Number(svg.getAttribute("width")), Number(svg.getAttribute("height")));
  notation.render();
  fitSongCourseRoom(notation as unknown as OpenSheetMusicDisplay, host, () => 0, 2 / 1.5);
  expect(notation.Zoom).toBe(2);
  expect(svg.getBoundingClientRect().height).toBe(210);
  expect(host.style.maxHeight).toBe("159px");
  expect(host.style.overflowY).toBe("auto");
  delete host.dataset.songCoursePlayhead;
  fitSongCourseRoom(notation as unknown as OpenSheetMusicDisplay, host, () => 0);
  expect(host.style.maxHeight).toBe("");
});
