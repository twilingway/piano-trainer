// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyStaffClayMaterial } from "./staffClayMaterial";
const source = `<svg xmlns="http://www.w3.org/2000/svg"><g class="vf-clef"><path d="M1 1L2 4"/></g><g class="vf-stave"><path d="M0 20L200 20" fill="none" stroke="#eee"/></g><g class="vf-stavenote"><g class="vf-notehead"><path d="M0 0L10 0L10 10L0 10Z M2 2L2 8L8 8L8 2Z" fill-rule="evenodd"/></g><g class="vf-stem"><path d="M10 0L10 -30"/></g></g><g class="vf-fingering"><text>3</text></g><text>Do</text></svg>`;
describe("clay SVG material", () => {
  it("preserves hollow glyph contours and stem coordinates, decorates only notation", () => {
    const host = document.createElement("div");
    host.innerHTML = source;
    const geometry = [...host.querySelectorAll("path")].map((p) => p.getAttribute("d"));
    applyStaffClayMaterial(host, true);
    expect([...host.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(geometry);
    expect(host.querySelector(".vf-notehead")?.getAttribute("style")).toContain("filter:");
    expect(host.querySelector(".vf-clef")?.getAttribute("style")).toContain("filter:");
    expect(host.querySelector(".vf-stave path")?.getAttribute("style")).toContain(
      "stroke-linecap: round"
    );
    expect(host.querySelector(".vf-fingering")?.getAttribute("style")).toBeNull();
    expect([...host.querySelectorAll("text")].every((t) => t.getAttribute("style") === null)).toBe(
      true
    );
    expect(host.querySelector(".vf-notehead path")?.getAttribute("fill-rule")).toBe("evenodd");
    expect(host.querySelector("feDiffuseLighting")).not.toBeNull();
    expect(host.querySelector("feSpecularLighting")).toBeNull();
    expect(host.querySelector("feTurbulence")).not.toBeNull();
    expect(host.querySelector('feBlend[mode="screen"]')).toBeNull();
  });
  it("keeps unique isolated filters for two scores and does not accumulate after resize", () => {
    const host = document.createElement("div");
    host.innerHTML = source + source;
    applyStaffClayMaterial(host, true);
    const ids = [...host.querySelectorAll("filter")].map((f) => f.id);
    applyStaffClayMaterial(host, true);
    expect([...host.querySelectorAll("filter")].map((f) => f.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(2);
    expect(host.querySelectorAll("defs[data-clay-material]")).toHaveLength(2);
    expect(host.querySelectorAll("svg[style]")).toHaveLength(0);
    applyStaffClayMaterial(host, false);
    expect(host.querySelectorAll("filter")).toHaveLength(0);
    expect(host.querySelectorAll("[data-clay-glyph]")).toHaveLength(0);
  });
});
