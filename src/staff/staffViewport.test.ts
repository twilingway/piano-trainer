// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitHeight, scrollTarget } from "./staffViewport";
import { fitCompactStaff } from "./fitCompactStaff";
import { courseRoom, showDrawing } from "./courseStaffView";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

afterEach(() => vi.unstubAllGlobals());
function hostFixture() {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => new DOMRect(0, 50, 800, 200);
  Object.defineProperties(host, {
    offsetHeight: { value: 200 },
    clientHeight: { value: 200 },
    clientWidth: { value: 800 },
    scrollHeight: { value: 2000 },
    scrollWidth: { value: 4000 }
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.getBoundingClientRect = () => new DOMRect(0, 50 - host.scrollTop, 2000, 1000);
  host.append(svg);
  return { host, svg };
}
describe("notation vertical room", () => {
  it("reserves room for complete cursor and bass fingering below a single system", () => {
    const { host } = hostFixture();
    fitHeight(host, [{ top: 20, bottom: 180 }], true, 0.4);
    expect(host.style.height).toBe("192px");
    const cursor = document.createElement("div");
    cursor.getBoundingClientRect = () => new DOMRect(400, 80, 3, 160);
    const target = scrollTarget(host, cursor, [{ top: 20, bottom: 180 }], true);
    expect(target.top).toBe(8);
    // With that scroll position, upper and lower ink have 12/20 px of breathing room.
    expect(20 - target.top).toBe(12);
    expect(192 - (180 - target.top)).toBe(20);
  });
  it("includes the padding when deciding how many wrapped systems fit", () => {
    const { host } = hostFixture();
    vi.stubGlobal("innerHeight", 600);
    fitHeight(
      host,
      [
        { top: 0, bottom: 100 },
        { top: 100, bottom: 200 }
      ],
      false,
      0.36
    );
    expect(host.style.height).toBe("132px");
  });
  it("reserves the same room before compact scaling without changing the preference", () => {
    const { host } = hostFixture();
    document.body.append(host);
    host.style.maxHeight = "200px";
    host.style.setProperty("--staff-fit", "1");
    const notation = { Zoom: 1, render: vi.fn() };
    fitCompactStaff(notation as unknown as OpenSheetMusicDisplay, host, { top: 0, bottom: 190 });
    expect(notation.Zoom).toBeCloseTo(166 / 190);
    expect(notation.render).toHaveBeenCalledOnce();
    host.remove();
  });
  it("leaves the same gaps around a fitted course drawing", () => {
    const { host, svg } = hostFixture();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.getBoundingClientRect = () => new DOMRect(10, 70, 200, 150);
    svg.append(group);
    showDrawing(host);
    expect(host.style.height).toBe("182px");
    expect(host.scrollTop).toBe(8);
  });
  it("subtracts vertical breathing room from the course fit budget", () => {
    const workspace = document.createElement("div");
    workspace.className = "workspace-main";
    Object.defineProperty(workspace, "clientHeight", { value: 600 });
    const { host } = hostFixture();
    workspace.append(host);
    expect(courseRoom(host, 0.3)).toEqual({ width: 784, height: 148 });
  });
});
