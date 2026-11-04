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
    x: "-18%",
    y: "-18%",
    width: "136%",
    height: "138%",
    "color-interpolation-filters": "sRGB"
  });
  // A tiny glyph-local height map gives broad rounded light instead of a metallic edge.
  filter.append(
    element("feGaussianBlur", { in: "SourceAlpha", stdDeviation: "0.85", result: "height" })
  );
  const diffuse = element("feDiffuseLighting", {
    in: "height",
    surfaceScale: "2.3",
    diffuseConstant: "1.12",
    "lighting-color": "#ffffff",
    result: "light"
  });
  diffuse.append(element("feDistantLight", { azimuth: "225", elevation: "58" }));
  const shine = element("feSpecularLighting", {
    in: "height",
    surfaceScale: "2.5",
    specularConstant: "0.42",
    specularExponent: "10",
    "lighting-color": "#fff9e9",
    result: "shine"
  });
  shine.append(element("feDistantLight", { azimuth: "225", elevation: "58" }));
  filter.append(
    diffuse,
    element("feComposite", {
      in: "light",
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
    shine,
    element("feComposite", {
      in: "shine",
      in2: "SourceAlpha",
      operator: "in",
      result: "insideShine"
    }),
    element("feBlend", { in: "body", in2: "insideShine", mode: "screen" })
  );
  return filter;
}
/** A bounded decoration pass over freshly engraved SVGs, never called by the frame loop. */
export function applyStaffClayMaterial(host: HTMLElement, enabled: boolean): void {
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
}
