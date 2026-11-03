import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  fitCourseDrawing,
  fitCourseInk,
  fitCourseZoom,
  courseRoom,
  showDrawing
} from "./courseStaffView";
import { beatPositions } from "./staffNoteIndex";
import { placeCursorLine } from "./liveCursor";

function fixture(ink: DOMRect, hostWidth = 800) {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: hostWidth });
  host.getBoundingClientRect = () => new DOMRect(0, 0, hostWidth, 250);
  const page = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "800");
  svg.setAttribute("height", "600");
  svg.getBBox = () => ink;
  svg.getBoundingClientRect = () => {
    const width = Number(svg.getAttribute("width"));
    return new DOMRect((hostWidth - width) / 2, 0, width, Number(svg.getAttribute("height")));
  };
  page.append(svg);
  host.append(page);
  return { host, svg, page };
}

describe("the short lesson score viewport", () => {
  it("crops blank SVG paper when the lesson ink already fits the visible scene", () => {
    const body = document.createElement("div");
    body.className = "lesson-workspace__body";
    Object.defineProperty(body, "clientHeight", { value: 140 });
    const { host, svg, page } = fixture(new DOMRect(40, 80, 180, 100));
    body.append(host);
    fitCourseDrawing(host);
    showDrawing(host);
    expect(Number(svg.getAttribute("height"))).toBe(124);
    expect(svg.getAttribute("viewBox")).toBe("28 68 204 124");
    expect(host.style.height).toBe("124px");
    expect(page.style.width).toBe("204px");
    expect(page.style.height).toBe("124px");
    expect(host.scrollTop).toBe(0);
  });
  it.each([
    [new DOMRect(40, 20, 180, 140), 204],
    [new DOMRect(20, 20, 360, 240), 384]
  ])("centers one note or a two-hand pair, retaining clefs and finger-label ink", (ink, width) => {
    const { host, svg, page } = fixture(ink);
    fitCourseDrawing(host);
    expect(svg.getAttribute("width")).toBe(String(width));
    expect(svg.getAttribute("viewBox")).toBe(`${String(ink.x - 12)} 0 ${String(width)} 600`);
    expect(page.style.transform).toBe("");
    const viewport = svg.getBoundingClientRect();
    const drawnMiddle = viewport.left + 12 + ink.width / 2;
    expect(drawnMiddle).toBe(400);
    fitCourseDrawing(host);
    expect(svg.getAttribute("width")).toBe(String(width));
  });

  it.each([new DOMRect(50, 20, 71, 56), new DOMRect(10, 10, 150, 110)])(
    "preserves OSMD's 3x physical scale and all vertical ink while centering",
    (ink) => {
      const { host, svg } = fixture(ink);
      svg.setAttribute("width", "509.73");
      svg.setAttribute("height", "414.6");
      svg.setAttribute("viewBox", "0 0 169.91 138.2");
      fitCourseDrawing(host);
      const [left, top, units, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
      const pixels = Number(svg.getAttribute("width"));
      const scale = pixels / (units ?? 1);
      expect(scale).toBeCloseTo(3, 10);
      expect(Number(svg.getAttribute("height")) / (height ?? 1)).toBeCloseTo(3, 10);
      expect(top).toBe(0);
      expect(height).toBe(138.2);
      expect(svg.getAttribute("height")).toBe("414.6");
      expect(ink.height * scale).toBeCloseTo(ink.height * 3, 10);
      const viewport = svg.getBoundingClientRect();
      const inkLeft = viewport.left + (ink.x - (left ?? 0)) * scale;
      const inkRight = inkLeft + ink.width * scale;
      expect(inkLeft + (inkRight - inkLeft) / 2).toBeCloseTo(400, 1);
      expect(inkLeft - viewport.left).toBeCloseTo(12, 10);
      expect(viewport.right - inkRight).toBeGreaterThanOrEqual(12);
      expect((ink.y + ink.height) * scale).toBeLessThan(Number(svg.getAttribute("height")));
      fitCourseDrawing(host);
      expect(svg.getAttribute("width")).toBe(String(pixels));
    }
  );

  it("tests the available room in pixels rather than viewBox units at OSMD zoom", () => {
    const { host, svg } = fixture(new DOMRect(20, 20, 300, 100));
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    fitCourseDrawing(host);
    expect(svg.getAttribute("width")).toBe("1200");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
  });

  it("keeps measured cursor coordinates aligned with zoomed noteheads after cropping", () => {
    const { host, svg } = fixture(new DOMRect(50, 20, 71, 56));
    svg.setAttribute("width", "509.73");
    svg.setAttribute("height", "414.6");
    svg.setAttribute("viewBox", "0 0 169.91 138.2");
    const note = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    note.getBoundingClientRect = () => {
      const viewBox = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
      const scale = Number(svg.getAttribute("width")) / (viewBox[2] ?? 1);
      return new DOMRect(
        svg.getBoundingClientRect().left + (100 - (viewBox[0] ?? 0) - 4) * scale,
        60,
        8 * scale,
        10 * scale
      );
    };
    svg.append(note);
    fitCourseDrawing(host);
    const lines = [{ top: 20, bottom: 180 }];
    const spots = beatPositions(new Map([[note, 0]]), host, lines);
    const cursor = document.createElement("div");
    placeCursorLine(host, cursor, spots, lines, 0);
    const headCenter = note.getBoundingClientRect().left + note.getBoundingClientRect().width / 2;
    expect(cursor.style.transform).toContain(`translate(${String(headCenter)}px,`);
  });

  it("fits narrow-phone ink with adaptive padding without reducing note scale", () => {
    const { host, svg } = fixture(new DOMRect(10, 10, 105.33, 60), 234);
    svg.setAttribute("width", "300");
    svg.setAttribute("height", "400");
    svg.setAttribute("viewBox", "0 0 150 200");
    fitCourseDrawing(host);
    const viewBox = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const pixels = Number(svg.getAttribute("width"));
    const scale = pixels / (viewBox[2] ?? 1);
    expect(scale).toBeCloseTo(2);
    expect(pixels).toBe(234);
    const left = svg.getBoundingClientRect().left + (10 - (viewBox[0] ?? 0)) * scale;
    const right = left + 105.33 * scale;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(host.clientWidth);
    expect((left + right) / 2).toBeCloseTo(117);
  });

  it("leaves a long phrase's original scrolling coordinate system intact", () => {
    const { host, svg } = fixture(new DOMRect(20, 20, 1600, 140));
    fitCourseDrawing(host);
    expect(svg.getAttribute("width")).toBe("800");
    expect(svg.getAttribute("viewBox")).toBeNull();
  });

  it("measures note and cursor in the same final viewport without a later transform", () => {
    const { host, svg } = fixture(new DOMRect(40, 20, 180, 140));
    const note = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    const nativeX = 160;
    note.getBoundingClientRect = () => {
      const left = Number(svg.getAttribute("viewBox")?.split(" ")[0] ?? 0);
      return new DOMRect(svg.getBoundingClientRect().left + nativeX - left - 8, 60, 16, 10);
    };
    svg.append(note);
    fitCourseDrawing(host);
    const lines = [{ top: 20, bottom: 180 }];
    const spots = beatPositions(new Map([[note, 0]]), host, lines);
    const cursor = document.createElement("div");
    placeCursorLine(host, cursor, spots, lines, 0);
    const headCenter = note.getBoundingClientRect().left + 8;
    expect(cursor.style.transform).toContain(`translate(${String(headCenter)}px,`);
  });

  it("restores the full original viewport if a subsequent drawing no longer fits", () => {
    const { host, svg } = fixture(new DOMRect(40, 20, 180, 140));
    svg.setAttribute("viewBox", "0 0 800 600");
    fitCourseDrawing(host);
    svg.getBBox = () => new DOMRect(20, 20, 1000, 200);
    fitCourseDrawing(host);
    expect(svg.getAttribute("width")).toBe("800");
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 600");
  });
});

describe("the complete lesson ink budget", () => {
  it("uses the allocated lesson scrollport instead of the workspace or rendered score height", () => {
    const workspace = document.createElement("div");
    workspace.className = "workspace-main";
    Object.defineProperty(workspace, "clientHeight", { value: 900 });
    const body = document.createElement("div");
    body.className = "lesson-workspace__body";
    Object.defineProperty(body, "clientHeight", { value: 180 });
    const { host } = fixture(new DOMRect(0, 0, 100, 100));
    host.style.maxHeight = "none";
    body.append(host);
    workspace.append(body);
    document.body.append(workspace);
    expect(courseRoom(host, 0.9).height).toBe(148);
    host.style.height = "800px";
    expect(courseRoom(host, 0.1).height).toBe(148);
    workspace.remove();
  });

  it("keeps manual lesson scale after fitting ink, across prompts, repeated layout and resize", () => {
    const body = document.createElement("div");
    body.className = "lesson-workspace__body";
    let roomHeight = 180;
    Object.defineProperty(body, "clientHeight", { get: () => roomHeight });
    const { host, svg } = fixture(new DOMRect(20, 30, 200, 100));
    host.style.maxHeight = "none";
    svg.setAttribute("viewBox", "0 0 400 200");
    body.append(host);
    document.body.append(body);
    const notation = {
      Zoom: 1,
      GraphicSheet: {
        MusicPages: [
          {
            MusicSystems: [
              {
                PositionAndShape: {
                  AbsolutePosition: { x: 0, y: 0 },
                  Size: { width: 40 },
                  BorderMarginTop: 0,
                  BorderMarginBottom: 10
                },
                StaffLines: [{ PositionAndShape: { AbsolutePosition: { y: 2 } } }]
              }
            ]
          }
        ]
      },
      render: vi.fn(() => {
        svg.setAttribute("width", String(400 * notation.Zoom));
        svg.setAttribute("height", String(200 * notation.Zoom));
        svg.setAttribute("viewBox", "0 0 400 200");
      })
    };
    const osmd = notation as unknown as OpenSheetMusicDisplay;
    const reach = { line: 140, above: 0, below: 140 };
    fitCourseZoom(osmd, host, 0.5, reach, 1);
    const baseline = notation.Zoom;
    expect(baseline).toBeCloseTo(148 / 140);
    fitCourseZoom(osmd, host, 0.5, reach, 2);
    expect(notation.Zoom).toBeCloseTo(baseline * 2);
    // Final ink can exceed the scrollport: the player's 200% must not be fitted back to 100%.
    expect(svg.getBBox().height * notation.Zoom).toBeGreaterThan(roomHeight);
    fitCourseDrawing(host);
    fitCourseZoom(osmd, host, 0.5, reach, 2);
    expect(notation.Zoom).toBeCloseTo(baseline * 2);
    svg.getBBox = () => new DOMRect(20, 40, 200, 80);
    fitCourseZoom(osmd, host, 0.5, reach, 2);
    expect(notation.Zoom).toBeCloseTo(baseline * 2);
    roomHeight = 240;
    fitCourseZoom(osmd, host, 0.5, reach, 2);
    expect(notation.Zoom).toBeCloseTo((208 / 140) * 2);
    fitCourseZoom(osmd, host, 0.5, reach, 1);
    expect(notation.Zoom).toBeCloseTo(208 / 140);
    roomHeight = 40;
    fitCourseZoom(osmd, host, 0.5, reach, 1.5);
    expect(notation.Zoom).toBeCloseTo((88 / 140) * 1.5);
    expect(courseRoom(host, 0.5).height).toBe(88);
    body.remove();
  });

  it("caps courseRoom to the same CSS height as the rendered lesson", () => {
    const workspace = document.createElement("div");
    workspace.className = "workspace-main";
    Object.defineProperty(workspace, "clientHeight", { value: 1000 });
    const { host } = fixture(new DOMRect(0, 0, 100, 100));
    host.style.maxHeight = "360px";
    workspace.append(host);
    document.body.append(workspace);
    expect(courseRoom(host, 0.5).height).toBe(328);
    workspace.remove();
  });

  it("fits both staves and the cue lyric ink instead of clipping at CSS max-height", () => {
    const { host, svg } = fixture(new DOMRect(20, 15, 200, 140));
    host.style.maxHeight = "360px";
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    document.body.append(host);
    const notation = {
      Zoom: 3,
      render: vi.fn(() => {
        svg.setAttribute("width", String(400 * notation.Zoom));
        svg.setAttribute("height", String(200 * notation.Zoom));
      })
    };
    fitCourseInk(notation as unknown as OpenSheetMusicDisplay, host);
    expect(notation.Zoom).toBeCloseTo(328 / 140);
    expect(notation.render).toHaveBeenCalledOnce();
    const finalInkHeight = (svg.getBBox().height * Number(svg.getAttribute("height"))) / 200;
    expect(finalInkHeight + 32).toBeCloseTo(360);
    fitCourseDrawing(host);
    expect(
      Number(svg.getAttribute("width")) / Number(svg.getAttribute("viewBox")?.split(" ")[2])
    ).toBeCloseTo(notation.Zoom);
    host.remove();
  });

  it("preserves a newly rendered OSMD scale instead of restoring stale crop data", () => {
    const { host, svg } = fixture(new DOMRect(20, 10, 100, 60));
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    fitCourseDrawing(host);
    svg.setAttribute("width", "800");
    svg.setAttribute("height", "400");
    svg.setAttribute("viewBox", "0 0 400 200");
    fitCourseDrawing(host);
    expect(
      Number(svg.getAttribute("width")) / Number(svg.getAttribute("viewBox")?.split(" ")[2])
    ).toBeCloseTo(2);
    expect(svg.getAttribute("height")).toBe("400");
  });
});

describe("the room reserved for an exercise's range", () => {
  it("stretches the viewport over the reserved span and reports how far the drawing moved", () => {
    const { host, svg } = fixture(new DOMRect(20, 20, 100, 60));
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    const reserved = { top: -10, bottom: 250 };
    expect(fitCourseDrawing(host, reserved)).toBe(30);
    expect(svg.getAttribute("viewBox")).toBe("16 -10 108 260");
    expect(svg.getAttribute("height")).toBe("780");
    // A second pass starts from OSMD's own viewport, not from the stretched one.
    expect(fitCourseDrawing(host, reserved)).toBe(30);
    expect(svg.getAttribute("viewBox")).toBe("16 -10 108 260");
  });

  it("leaves the page's height alone when the reserved span fits inside it", () => {
    const { host, svg } = fixture(new DOMRect(20, 20, 100, 60));
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    expect(fitCourseDrawing(host, { top: 10, bottom: 150 })).toBe(0);
    expect(svg.getAttribute("viewBox")).toBe("16 0 108 200");
    expect(svg.getAttribute("height")).toBe("600");
  });

  it("sizes the view to the reserved span, not only to the note drawn now", () => {
    const { host, svg } = fixture(new DOMRect(20, 20, 100, 60));
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 400 200");
    const ink = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ink.getBoundingClientRect = () => new DOMRect(300, 60, 200, 180);
    svg.append(ink);
    showDrawing(host);
    expect(host.style.height).toBe("212px");
    // Reserved 10..150 SVG units at 3 px each: 30..450 px on screen.
    showDrawing(host, { top: 10, bottom: 150 });
    expect(host.style.height).toBe("452px");
  });
});
