// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fitStaffIllustration } from "./staffIllustration";
describe("static staff illustration fit", () => {
  it("fits all real ink into a fixed frame without changing musical paths or accumulating crop", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div><svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000"><path d="M0 0L10 10"/></svg></div>';
    Object.defineProperties(host, { clientWidth: { value: 254 }, clientHeight: { value: 150 } });
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("Missing svg");
    svg.getBBox = () => new DOMRect(50, 20, 355, 108);
    expect(fitStaffIllustration(host)).toEqual([{ top: 8, bottom: 142 }]);
    expect(svg.getAttribute("width")).toBe("254");
    expect(svg.getAttribute("height")).toBe("150");
    expect(svg.getAttribute("viewBox")).toBe("42 12 371 124");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    const before = svg.outerHTML;
    fitStaffIllustration(host);
    expect(svg.outerHTML).toBe(before);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M0 0L10 10");
    expect(svg.parentElement?.style.width).toBe("254px");
  });
});
