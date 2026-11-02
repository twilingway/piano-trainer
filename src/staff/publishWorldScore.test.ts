// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { worldScoreSnapshot } from "./publishWorldScore";
import { StaffWorldSource } from "./staffWorldSnapshot";
import { scoreTileSvg, worldScoreTile } from "../render/three/worldScoreTile";
it("publishes a clean measured SVG and rasterizes only the requested viewBox crop", () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="200"><path d="M0 0L10 10" stroke="white"/><foreignObject/><script/></svg>';
  Object.defineProperty(host, "clientWidth", { value: 1200 });
  Object.defineProperty(host, "clientHeight", { value: 200 });
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("Missing SVG");
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100000,
    bottom: 200,
    width: 100000,
    height: 200,
    toJSON: () => ({})
  });
  const result = worldScoreSnapshot(host, [{ beat: 0, x: 80, line: 0 }], [{ top: 0, bottom: 200 }]);
  if (!result) throw new Error("Missing snapshot");
  expect(result.width).toBe(100000);
  expect(result.svg).not.toContain("foreignObject");
  expect(result.svg).not.toContain("<script");
  const tile = worldScoreTile(result, 50000, 0, 2048);
  const cropped = new DOMParser().parseFromString(
    scoreTileSvg(result.svg, tile),
    "image/svg+xml"
  ).documentElement;
  expect(Number(cropped.getAttribute("width"))).toBeLessThanOrEqual(2048);
  expect(cropped.getAttribute("viewBox")).toBe(`${String(tile.left)} 0 2400 200`);
});
describe("workspace score source ownership", () => {
  it("keeps score and error status local and reads the supplied session beat", () => {
    const a = new StaffWorldSource(),
      b = new StaffWorldSource();
    let beat = 4;
    const changed = vi.fn();
    a.subscribeStatus(changed);
    a.configure(true, () => beat);
    a.setStatus("ready");
    expect(a.getStatus()).toBe("ready");
    expect(b.getStatus()).toBe("idle");
    beat = 7;
    expect(a.readBeat()).toBe(7);
    a.configure(false, () => beat);
    expect(a.getStatus()).toBe("idle");
    expect(changed).toHaveBeenCalled();
  });
});

it("freezes source CSS for thin staff lines, stems and styled fingering text into the SVG image", () => {
  const rules = document.createElement("style");
  rules.textContent =
    ".staff .staffline .vf-measure path[fill=none]{stroke-width:.7px;stroke-opacity:.65;stroke:white}.staff .secondary path{stroke-width:.65px}.staff .stem{stroke-width:1.2px}.staff text.finger{font-size:18px;font-family:Georgia;font-weight:700;fill:cyan;paint-order:stroke fill;stroke-linejoin:round}";
  document.head.append(rules);
  const host = document.createElement("div");
  host.className = "staff";
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg"><g class="staffline"><g class="vf-measure"><path id="thin" fill="none"/></g></g><g class="secondary"><path id="thin2"/></g><path id="stem" class="stem"/><text class="finger">3</text><defs><path id="glyph"/></defs></svg>';
  document.body.append(host);
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("Missing SVG");
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 200,
    width: 800,
    height: 200,
    toJSON: () => ({})
  });
  try {
    const snapshot = worldScoreSnapshot(host, [], []);
    if (!snapshot) throw new Error("Missing snapshot");
    const exported = new DOMParser().parseFromString(snapshot.svg, "image/svg+xml");
    const styleOf = (selector: string) => exported.querySelector<SVGElement>(selector)?.style;
    expect(styleOf("#thin")?.strokeWidth).toBe(".7px");
    expect(styleOf("#thin")?.strokeOpacity).toBe(".65");
    expect(styleOf("#thin2")?.strokeWidth).toBe(".65px");
    expect(styleOf("#stem")?.strokeWidth).toBe("1.2px");
    expect(styleOf("text")?.fontSize).toBe("18px");
    expect(styleOf("text")?.fontFamily).toBe("Georgia");
    expect(styleOf("text")?.fontWeight).toBe("700");
    expect(styleOf("text")?.fill).toBe("cyan");
    expect(styleOf("text")?.paintOrder).toBe("stroke fill");
    expect(styleOf("#glyph")?.fill).toBe("");
  } finally {
    rules.remove();
    host.remove();
  }
});
