// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { installSongCourseHeader } from "./songCourseHeader";
import { worldScoreSnapshot } from "./publishWorldScore";

afterEach(() => {
  document.body.replaceChildren();
});

function required<T extends Element>(element: T | null): T {
  if (!element) throw new Error("Missing fixture element");
  return element;
}

function fixture(sourceOffset = 0) {
  const room = document.body.appendChild(document.createElement("div"));
  room.style.position = "relative";
  room.style.backgroundColor = "rgb(3, 14, 24)";
  const host = room.appendChild(document.createElement("div"));
  host.className = "staff staff--course";
  host.dataset.songCoursePlayhead = "128";
  host.innerHTML = `<div class="staff-page"><svg width="900" height="140" viewBox="0 0 900 140" xmlns="http://www.w3.org/2000/svg"><defs><filter id="clay-light"><feGaussianBlur stdDeviation="1"/></filter></defs><g class="staffline" transform="translate(0 10)"><g class="vf-measure"><path id="staff-line" d="M0 50L900 50" fill="none" stroke="#fff"/><g id="intro-clef" class="vf-clef" style="filter:url(#clay-light)"><path d="M10 20L30 70"/><image href="data:image/webp;base64,AA==" width="20" height="50"/></g><g class="vf-timesignature"><path d="M45 30L65 60"/></g><g class="vf-keysignature"><path d="M35 30L40 40"/></g><g class="vf-stavenote" id="real-note"><g class="vf-notehead"><path d="M100 50L120 50"/></g><g class="vf-stem"><path d="M120 50L120 20"/></g><text>1</text></g><g id="later-clef" class="vf-clef"><path d="M600 20L620 70"/></g></g></g></svg></div>`;
  const svg = required(host.querySelector("svg"));
  room.getBoundingClientRect = () => new DOMRect(5, 10, 350, 180);
  host.getBoundingClientRect = () => new DOMRect(20, 40, 320, 140);
  svg.getBoundingClientRect = () => new DOMRect(20 + sourceOffset - host.scrollLeft, 40, 900, 140);
  const boxes = [
    ["#intro-clef", 10, 20, 20, 50],
    [".vf-timesignature", 45, 30, 20, 30],
    [".vf-keysignature", 35, 30, 5, 10],
    ["#later-clef", 600, 20, 20, 50],
    [".vf-notehead", 100, 50, 20, 10],
    ["#staff-line", 0, 50, 900, 0]
  ] as const;
  for (const [selector, x, y, width, height] of boxes) {
    const element = required(svg.querySelector(selector));
    element.getBoundingClientRect = () =>
      new DOMRect(20 + sourceOffset + x - host.scrollLeft, 40 + y, width, height);
  }
  return { room, host, svg };
}

describe("fixed song-course score header", () => {
  it("keeps the actual introductory symbols fixed while the original note SVG scrolls", () => {
    const { room, host, svg } = fixture();
    const header = installSongCourseHeader(host);
    const overlay = room.querySelector<HTMLElement>(".song-course-header");
    expect(header).toBeDefined();
    expect(overlay?.parentElement).toBe(host.parentElement);
    expect(host.contains(overlay)).toBe(false);
    expect(overlay?.querySelectorAll(".vf-clef")).toHaveLength(1);
    expect(overlay?.querySelector(".vf-timesignature")).not.toBeNull();
    expect(overlay?.querySelector(".vf-keysignature")).not.toBeNull();
    expect(overlay?.querySelector(".vf-stavenote, .vf-notehead, .vf-stem, text")).toBeNull();
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    const fixedLeft = overlay?.style.left;
    const initialSvgLeft = svg.getBoundingClientRect().left;
    host.scrollLeft = 420;
    host.dispatchEvent(new Event("scroll"));
    header?.frame();
    expect(svg.getBoundingClientRect().left).toBe(initialSvgLeft - 420);
    expect(overlay?.style.left).toBe(fixedLeft);
    expect(overlay?.style.top).toBe("30px");
    expect(overlay?.style.backgroundColor).toBe("rgb(3, 14, 24)");
    header?.dispose();
    expect(room.querySelector(".song-course-header")).toBeNull();
  });

  it("uses unique referenced definition IDs and stays outside world-score exports and note queries", () => {
    const { room, host } = fixture();
    const original = host.innerHTML;
    const header = installSongCourseHeader(host);
    const ids = [...room.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const clone = required(room.querySelector(".song-course-header svg"));
    const filter = required(clone.querySelector("filter"));
    expect(clone.querySelector(".vf-clef")?.getAttribute("style")).toContain(`#${filter.id}`);
    expect(host.querySelectorAll("[data-song-course-prefix]")).toHaveLength(3);
    expect(host.querySelectorAll("svg")).toHaveLength(1);
    expect(host.querySelectorAll(".vf-notehead")).toHaveLength(1);
    const snapshot = worldScoreSnapshot(
      host,
      [{ beat: 0, x: 100, line: 0 }],
      [{ top: 0, bottom: 100 }]
    );
    expect(snapshot?.svg).toContain('id="real-note"');
    expect(snapshot?.svg).not.toContain("song-course-header-");
    expect(snapshot?.svg).not.toContain("visibility: hidden");
    header?.dispose();
    expect(host.innerHTML).toBe(original);
  });

  it("also fixes the header of a short score and skips an absent drawing", () => {
    const { room, host } = fixture();
    const header = installSongCourseHeader(host);
    expect(header).toBeDefined();
    header?.dispose();
    host.replaceChildren();
    expect(installSongCourseHeader(host)).toBeUndefined();
    expect(room.querySelector(".song-course-header")).toBeNull();
  });
  it("masks the original moving prefix at the beginning without hiding it in the exported SVG", () => {
    const { room, host, svg } = fixture(28);
    host.dataset.songCoursePlayhead = "138";
    const header = installSongCourseHeader(host);
    const overlay = required(room.querySelector<HTMLElement>(".song-course-header"));
    const time = required(svg.querySelector(".vf-timesignature"));
    expect(
      host.getBoundingClientRect().left + parseFloat(overlay.style.width)
    ).toBeGreaterThanOrEqual(time.getBoundingClientRect().right);
    expect(svg.querySelector(".vf-clef")?.getAttribute("style")).not.toContain("visibility");
    const initial = parseFloat(overlay.style.width);
    host.scrollLeft = 420;
    header?.frame();
    expect(parseFloat(overlay.style.width)).toBe(initial);
    header?.dispose();
  });
});

it("caps an opaque enlarged prefix before the cursor and keeps its initial copy still", () => {
  const { room, host, svg } = fixture(28);
  host.dataset.songCoursePlayhead = "250";
  host.dataset.songCourseCursorGap = "20";
  required(svg.querySelector(".vf-notehead")).getBoundingClientRect = () =>
    new DOMRect(348 - host.scrollLeft, 90, 40, 20);
  required(svg.querySelector(".vf-timesignature")).getBoundingClientRect = () =>
    new DOMRect(93 - host.scrollLeft, 70, 250, 60);
  const header = installSongCourseHeader(host);
  const overlay = required(room.querySelector<HTMLElement>(".song-course-header"));
  const clone = required(overlay.querySelector("svg"));
  expect(parseFloat(overlay.style.width)).toBe(224);
  expect(clone.style.marginLeft).toBe("-70px");
  host.scrollLeft = 400;
  header?.frame();
  expect(parseFloat(overlay.style.width)).toBe(224);
  expect(clone.style.marginLeft).toBe("-70px");
  expect(host.innerHTML).not.toContain("song-course-header");
  header?.dispose();
});

it("recreates the same fixed prefix after a zoom or relayout in the middle of scrolling", () => {
  const { room, host } = fixture(28);
  host.dataset.songCoursePlayhead = "160";
  host.dataset.songCourseCursorGap = "18";
  const initial = installSongCourseHeader(host);
  const first = required(room.querySelector<HTMLElement>(".song-course-header"));
  const drawing = required(first.querySelector("svg"));
  const margin = drawing.style.marginLeft;
  const width = first.style.width;
  initial?.dispose();
  host.scrollLeft = 420;
  const rebuilt = installSongCourseHeader(host);
  const second = required(room.querySelector<HTMLElement>(".song-course-header"));
  expect(required(second.querySelector("svg")).style.marginLeft).toBe(margin);
  expect(second.style.width).toBe(width);
  rebuilt?.dispose();
});

it("clips the fixed header to the row while vertically scrolling enlarged notation", () => {
  const { room, host, svg } = fixture();
  svg.getBoundingClientRect = () =>
    new DOMRect(20 - host.scrollLeft, 40 - host.scrollTop, 900, 210);
  const header = installSongCourseHeader(host);
  const overlay = required(room.querySelector<HTMLElement>(".song-course-header"));
  const clone = required(overlay.querySelector("svg"));
  expect(overlay.style.top).toBe("30px");
  expect(overlay.style.height).toBe("140px");
  expect(clone.getAttribute("height")).toBe("210");
  expect(clone.style.marginTop).toBe("0px");
  host.scrollTop = 50;
  host.dispatchEvent(new Event("scroll"));
  expect(overlay.style.top).toBe("30px");
  expect(overlay.style.height).toBe("140px");
  expect(clone.style.marginTop).toBe("-50px");
  expect(overlay.style.overflow).toBe("hidden");
  header?.dispose();
});

it("keeps one visible prefix while the first note approaches from beyond the viewport", () => {
  const { room, host, svg } = fixture(500);
  host.dataset.songCoursePlayhead = "160";
  const header = installSongCourseHeader(host);
  const overlay = required(room.querySelector<HTMLElement>(".song-course-header"));
  const drawing = required(overlay.querySelector("svg"));
  expect(drawing.style.marginLeft).toBe("50px");
  expect(host.querySelectorAll("[data-song-course-prefix]")).toHaveLength(3);
  expect(overlay.querySelectorAll("[data-song-course-prefix]")).toHaveLength(0);
  expect(svg.querySelector(".vf-clef")?.getAttribute("style")).not.toContain("visibility");
  const position = [drawing.style.marginLeft, overlay.style.width];
  host.scrollLeft = 610;
  header?.frame();
  expect([drawing.style.marginLeft, overlay.style.width]).toEqual(position);
  header?.dispose();
  expect(host.querySelectorAll("[data-song-course-prefix]")).toHaveLength(0);
});

function fiveRailFixture(sourceOffset = 500) {
  const scene = fixture(sourceOffset);
  const original = required(scene.svg.querySelector<SVGPathElement>("#staff-line"));
  original.style.strokeOpacity = "0.65";
  original.style.strokeWidth = "1.6";
  for (let index = 1; index < 5; index++) {
    const rail = original.cloneNode(true) as SVGPathElement;
    rail.id = `staff-line-${String(index)}`;
    const y = 50 + index * 10;
    rail.setAttribute("d", `M0 ${String(y)}L900 ${String(y)}`);
    rail.getBoundingClientRect = () =>
      new DOMRect(20 + sourceOffset - scene.host.scrollLeft, 40 + y, 900, 0);
    original.parentElement?.append(rail);
  }
  scene.host.dataset.songCoursePlayhead = "160";
  return scene;
}

it("uses one continuous five-rail drawing throughout the run-up and playback without seams", () => {
  const { room, host, svg } = fiveRailFixture();
  const original = svg.innerHTML;
  const header = installSongCourseHeader(host);
  const bridge = required(room.querySelector<HTMLElement>(".song-course-rails"));
  const prefix = required(room.querySelector<HTMLElement>(".song-course-header"));
  const drawing = required(bridge.querySelector("svg"));
  const rails = [...drawing.querySelectorAll(".vf-measure > path")];
  expect(rails).toHaveLength(5);
  expect(drawing.querySelector(".vf-clef, .vf-timesignature, .vf-stavenote, text")).toBeNull();
  expect(bridge.nextElementSibling).toBe(host);
  expect(bridge.style.pointerEvents).toBe("none");
  expect(bridge.style.backgroundColor).toBe("");
  expect(bridge.style.zIndex).toBe("0");
  expect(drawing.style.overflow).toBe("visible");
  expect(rails.every((line) => line.getAttribute("d")?.includes("L1220 "))).toBe(true);
  expect(rails.every((line) => line.getAttribute("style")?.includes("stroke-opacity: 0.65"))).toBe(
    true
  );
  const prefixEnd = parseFloat(prefix.style.left) + parseFloat(prefix.style.width);
  const firstStart = parseFloat(bridge.style.left);
  expect(firstStart).toBeLessThanOrEqual(prefixEnd);
  expect(firstStart + parseFloat(bridge.style.width)).toBe(335);
  const prefixPosition = [prefix.style.left, prefix.style.width];
  const fullWidth = bridge.style.width;
  const fixedStart = bridge.style.left;
  expect(fullWidth).toBe("270px");
  expect(host.querySelectorAll("[data-song-course-rail]")).toHaveLength(5);
  // No moving round endcap is composited over this line, before or after arrival.
  for (const scroll of [0, 200, 450, 700, 950]) {
    host.scrollLeft = scroll;
    header?.frame();
    expect(bridge.style.width).toBe(fullWidth);
    expect(bridge.style.left).toBe(fixedStart);
    expect(host.querySelectorAll("[data-song-course-rail]")).toHaveLength(5);
    expect([prefix.style.left, prefix.style.width]).toEqual(prefixPosition);
  }
  expect(host.querySelectorAll("svg")).toHaveLength(1);
  const snapshot = worldScoreSnapshot(
    host,
    [{ beat: 0, x: 100, line: 0 }],
    [{ top: 0, bottom: 100 }]
  );
  expect(snapshot?.svg).not.toContain("song-course-rails");
  expect(snapshot?.svg).not.toContain("L1220 ");
  const ids = [...room.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  header?.dispose();
  expect(room.querySelector(".song-course-rails")).toBeNull();
  expect(svg.innerHTML).toBe(original);
});

it("keeps enlarged bridge rails vertically aligned and clipped to the current row", () => {
  const { room, host, svg } = fiveRailFixture();
  svg.getBoundingClientRect = () =>
    new DOMRect(520 - host.scrollLeft, 40 - host.scrollTop, 1800, 280);
  const header = installSongCourseHeader(host);
  const bridge = required(room.querySelector<HTMLElement>(".song-course-rails"));
  const drawing = required(bridge.querySelector("svg"));
  expect(drawing.getAttribute("width")).toBe("1800");
  expect(drawing.getAttribute("height")).toBe("280");
  expect(bridge.style.height).toBe("140px");
  expect(bridge.style.top).toBe("30px");
  expect(bridge.style.overflow).toBe("hidden");
  host.scrollTop = 50;
  host.dispatchEvent(new Event("scroll"));
  expect(drawing.style.marginTop).toBe("-50px");
  expect(bridge.style.top).toBe("30px");
  expect(bridge.style.height).toBe("140px");
  header?.dispose();
  expect(room.querySelector(".song-course-rails")).toBeNull();
});

it("hides horizontal rails in every moving measure while retaining barlines and ledger lines", () => {
  const { room, host, svg } = fiveRailFixture();
  const style = document.body.appendChild(document.createElement("style"));
  style.textContent = ".staff [data-song-course-rail]{visibility:hidden}";
  const measure = document.createElementNS("http://www.w3.org/2000/svg", "g");
  measure.setAttribute("class", "vf-measure");
  svg.append(measure);
  for (let index = 0; index < 5; index++) {
    const rail = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rail.id = `second-rail-${String(index)}`;
    const y = 50 + index * 10;
    rail.setAttribute("d", `M900 ${String(y)}L1800 ${String(y)}`);
    rail.getBoundingClientRect = () => new DOMRect(1420 - host.scrollLeft, 40 + y, 900, 0);
    measure.append(rail);
  }
  const barline = document.createElementNS("http://www.w3.org/2000/svg", "path");
  barline.setAttribute("d", "M900 50L900 90");
  barline.getBoundingClientRect = () => new DOMRect(1420, 90, 0, 40);
  measure.append(barline);
  const ledger = document.createElementNS("http://www.w3.org/2000/svg", "g");
  ledger.setAttribute("class", "vf-ledgers");
  ledger.innerHTML = '<path d="M100 100L120 100"/>';
  svg.append(ledger);
  const original = svg.innerHTML;
  const header = installSongCourseHeader(host);
  expect(host.querySelectorAll("[data-song-course-rail]")).toHaveLength(10);
  for (const line of host.querySelectorAll("[data-song-course-rail]")) {
    expect(getComputedStyle(line).visibility).toBe("hidden");
  }
  expect(barline.hasAttribute("data-song-course-rail")).toBe(false);
  expect(ledger.querySelector("path")?.hasAttribute("data-song-course-rail")).toBe(false);
  expect(room.querySelectorAll(".song-course-rails .vf-measure > path")).toHaveLength(5);
  expect(room.querySelectorAll(".song-course-rails [data-song-course-rail]")).toHaveLength(0);
  const snapshot = worldScoreSnapshot(
    host,
    [{ beat: 0, x: 100, line: 0 }],
    [{ top: 0, bottom: 100 }]
  );
  expect(snapshot?.svg).toContain('id="second-rail-4"');
  expect(snapshot?.svg).not.toContain("visibility: hidden");
  header?.dispose();
  expect(svg.innerHTML).toBe(original);
});
