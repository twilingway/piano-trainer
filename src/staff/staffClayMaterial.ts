import { applyStaffClayClefs } from "./staffClayClefs";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { applyStaffClayFaces } from "./staffClayFaces";
const NS = "http://www.w3.org/2000/svg";
let nextId = 0;
function element(name: string, attributes: Readonly<Record<string, string>>) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
function material(id: string): SVGElement {
  const filter = element("filter", {
    id,
    x: "-10%",
    y: "-10%",
    width: "120%",
    height: "120%",
    "color-interpolation-filters": "sRGB"
  });
  filter.append(
    element("feGaussianBlur", { in: "SourceAlpha", stdDeviation: "0.75", result: "height" })
  );
  const diffuse = element("feDiffuseLighting", {
    in: "height",
    surfaceScale: "1.5",
    diffuseConstant: "1",
    "lighting-color": "#ffffff",
    result: "light"
  });
  diffuse.append(element("feDistantLight", { azimuth: "225", elevation: "60" }));
  const soften = element("feComponentTransfer", { in: "light", result: "softLight" });
  for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) {
    soften.append(element(channel, { type: "linear", slope: "0.3", intercept: "0.7" }));
  }
  filter.append(
    diffuse,
    soften,
    element("feComposite", {
      in: "softLight",
      in2: "SourceAlpha",
      operator: "in",
      result: "insideLight"
    }),
    element("feBlend", {
      in: "SourceGraphic",
      in2: "insideLight",
      mode: "multiply",
      result: "body"
    }),
    element("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.65",
      numOctaves: "1",
      seed: "7",
      result: "grain"
    })
  );
  const grain = element("feComponentTransfer", { in: "grain", result: "softGrain" });
  for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) {
    grain.append(element(channel, { type: "linear", slope: "0.045", intercept: "0.955" }));
  }
  filter.append(
    grain,
    element("feBlend", { in: "body", in2: "softGrain", mode: "multiply", result: "textured" }),
    element("feComposite", { in: "textured", in2: "SourceAlpha", operator: "in" })
  );
  return filter;
}
/** A bounded decoration pass over freshly engraved SVGs, never called by the frame loop. */
export function applyStaffClayMaterial(
  host: HTMLElement,
  enabled: boolean,
  osmd?: OpenSheetMusicDisplay
): void {
  applyStaffClayFaces(host, enabled, osmd);
  for (const svg of host.querySelectorAll("svg")) {
    const previous = svg.querySelector<SVGElement>("defs[data-clay-material]");
    for (const painted of svg.querySelectorAll<SVGElement>("[data-clay-glyph]")) {
      painted.style.removeProperty("filter");
      painted.style.removeProperty("stroke-linecap");
      painted.style.removeProperty("stroke-linejoin");
      painted.style.removeProperty("stroke-width");
      delete painted.dataset.clayGlyph;
    }
    if (!enabled) {
      previous?.remove();
      continue;
    }
    const id = previous?.dataset.clayMaterial ?? `staff-clay-${String(++nextId)}`;
    if (!previous) {
      const defs = element("defs", { "data-clay-material": id });
      defs.append(material(id));
      svg.prepend(defs);
    }
    // Grouping is local: neither fingering/lyrics nor the play cursor receives a material.
    const glyphs = svg.querySelectorAll<SVGElement>(
      "g.vf-notehead, g.vf-clef, g.vf-flag, g.vf-accidental, g.vf-rest"
    );
    for (const glyph of glyphs) {
      glyph.dataset.clayGlyph = "raised";
      glyph.style.filter = `url(#${id})`;
      glyph.style.strokeLinecap = "round";
      glyph.style.strokeLinejoin = "round";
    }
    // VexFlow emits staff/ledger lines as simple stroked paths inside stave/stavenote groups.
    for (const line of svg.querySelectorAll<SVGElement>(
      ".vf-measure > path, .vf-ledgers > path, .vf-stave > path, .vf-stem > path"
    )) {
      const d = line.getAttribute("d") ?? "";
      if (!/^M[\d .,+-]+L[\d .,+-]+\s*$/i.test(d) || line.closest(".vf-clef")) continue;
      line.dataset.clayGlyph = "line";
      line.style.strokeLinecap = "round";
      line.style.strokeLinejoin = "round";
      if (!line.closest(".vf-stem")) line.style.strokeWidth = "1.6";
      line.style.filter =
        "drop-shadow(0 0.65px 0 rgb(0 0 0 / 0.32)) drop-shadow(0 -0.3px 0 rgb(255 255 255 / 0.26))";
    }
  }
  applyStaffClayClefs(host, enabled, osmd);
}
