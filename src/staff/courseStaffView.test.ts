import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fitCourseDrawing, fitCourseInk, courseRoom } from "./courseStaffView";
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
