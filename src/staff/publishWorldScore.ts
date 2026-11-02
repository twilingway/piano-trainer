import type { BeatSpot } from "./liveCursor";
import type { LineBox } from "./staffViewport";
import type { StaffWorldSnapshot } from "./staffWorldSnapshot";

const SVG_PAINT_PROPERTIES = [
  "color",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray"
] as const;

/** SVG-as-an-image cannot see the application's CSS; freeze its computed presentation once. */
function freezeSvgPresentation(source: SVGSVGElement, clone: SVGSVGElement): void {
  const originals = [source, ...source.querySelectorAll<SVGElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>("*")];
  originals.forEach((element, index) => {
    const target = copies[index];
    // Referenced glyph definitions inherit their paint at each <use>, not at the defs container.
    if (!target || element.closest("defs")) return;
    const computed = getComputedStyle(element);
    for (const property of SVG_PAINT_PROPERTIES) {
      const value = computed.getPropertyValue(property).trim();
      if (value) target.style.setProperty(property, value);
    }
  });
}

/** Flatten measured SVG pages into pixel coordinates shared with the original reader's beat map. */
export function worldScoreSnapshot(
  host: HTMLElement,
  spots: readonly BeatSpot[],
  lines: readonly LineBox[]
): StaffWorldSnapshot | undefined {
  const drawings = [...host.querySelectorAll("svg")];
  if (!drawings.length) return undefined;
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const origin = host.getBoundingClientRect();
  let width = Math.max(1, host.clientWidth),
    height = Math.max(1, host.clientHeight);
  for (const drawing of drawings) {
    const rect = drawing.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const x = rect.left - origin.left + host.scrollLeft;
    const y = rect.top - origin.top + host.scrollTop;
    const clone = drawing.cloneNode(true) as SVGSVGElement;
    freezeSvgPresentation(drawing, clone);
    clone.querySelectorAll("script,foreignObject,image").forEach((node) => {
      node.remove();
    });
    clone.setAttribute("x", String(x));
    clone.setAttribute("y", String(y));
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
    root.append(clone);
    width = Math.max(width, x + rect.width);
    height = Math.max(height, y + rect.height);
  }
  if (!root.children.length) return undefined;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `0 0 ${String(width)} ${String(height)}`);
  return {
    svg: new XMLSerializer().serializeToString(root),
    width,
    height,
    viewportWidth: Math.max(1, host.clientWidth),
    viewportHeight: Math.max(1, host.clientHeight),
    spots: spots.map((spot) => ({ ...spot })),
    lines: lines.map((line) => ({ ...line }))
  };
}
