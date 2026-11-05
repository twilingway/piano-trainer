const GLYPHS = ".vf-clef, .vf-timesignature, .vf-keysignature";
const PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "font-family",
  "font-size",
  "font-weight"
] as const;
let headerId = 0;

/** Clone only actual introductory symbols and staff lines, preserving their SVG transforms. */
function headerDrawing(source: SVGSVGElement, firstNoteX: number): SVGSVGElement | undefined {
  const selected = new Set<Element>();
  for (const glyph of source.querySelectorAll<SVGGraphicsElement>(GLYPHS)) {
    const box = glyph.getBoundingClientRect();
    if (box.width > 0 && box.right < firstNoteX) selected.add(glyph);
  }
  if (!selected.size) return undefined;
  for (const line of source.querySelectorAll<SVGGraphicsElement>(
    ".vf-measure > path, .vf-stave > path"
  )) {
    const box = line.getBoundingClientRect();
    if (box.width > 1 && box.height <= 2) selected.add(line);
  }
  const copy = (node: Element): Element | undefined => {
    if (node.localName === "defs") return node.cloneNode(true) as Element;
    if (selected.has(node)) {
      const clone = node.cloneNode(true) as SVGElement;
      const originals = [node, ...node.querySelectorAll("*")];
      const copies = [clone, ...clone.querySelectorAll<SVGElement>("*")];
      originals.forEach((original, index) => {
        const target = copies[index];
        if (!target) return;
        const paint = getComputedStyle(original);
        for (const key of PAINT) {
          const value = paint.getPropertyValue(key);
          if (value) target.style.setProperty(key, value);
        }
      });
      return clone;
    }
    const children = [...node.children].flatMap((child) => {
      const cloned = copy(child);
      return cloned ? [cloned] : [];
    });
    if (!children.length) return undefined;
    const clone = node.cloneNode(false) as Element;
    clone.append(...children);
    return clone;
  };
  const clone = copy(source) as SVGSVGElement | undefined;
  if (!clone) return undefined;
  const prefix = `song-course-header-${String(++headerId)}-`;
  const ids = new Map<string, string>();
  for (const element of [clone, ...clone.querySelectorAll("[id]")]) {
    const id = element.getAttribute("id");
    if (id) {
      ids.set(id, prefix + id);
      element.setAttribute("id", prefix + id);
    }
  }
  for (const element of [clone, ...clone.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      for (const [id, replacement] of ids) {
        value = value.replaceAll(`url(#${id})`, `url(#${replacement})`);
        if (value === `#${id}`) value = `#${replacement}`;
      }
      element.setAttribute(attribute.name, value);
    }
  }
  return clone;
}

function opaqueBackground(host: HTMLElement): string {
  let element: HTMLElement | null = host;
  while (element) {
    const color = getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    element = element.parentElement;
  }
  return "#030e18";
}

/** Baked outside the scrolling reader: exports, note indices and the clock keep their original SVG. */
export function installSongCourseHeader(host: HTMLElement) {
  const source = host.querySelector("svg");
  const parent = host.parentElement;
  if (!source || !parent) return undefined;
  const first = source.querySelector<SVGGraphicsElement>(".vf-notehead");
  if (!first) return undefined;
  const firstBox = first.getBoundingClientRect();
  const drawing = headerDrawing(source, firstBox.left);
  if (!drawing) return undefined;
  const sourceBox = source.getBoundingClientRect();
  // Keep the initial balanced composition, while an opaque prefix masks the moving original.
  const anchor = host.dataset.songCoursePlayhead;
  const sourceOffset =
    anchor === undefined
      ? sourceBox.left - host.getBoundingClientRect().left
      : Number(anchor) - (firstBox.left + firstBox.width / 2 - sourceBox.left);
  const glyphs = [...source.querySelectorAll<SVGGraphicsElement>(GLYPHS)]
    .map((glyph) => glyph.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.right < firstBox.left);
  const introRight = Math.max(...glyphs.map((box) => box.right - sourceBox.left));
  const width = Math.min(firstBox.left - sourceBox.left - 6, introRight + 6);
  if (!(width > 0 && sourceBox.height > 0)) return undefined;
  const overlay = document.createElement("div");
  overlay.className = "song-course-header";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "2",
    width: `${String(width)}px`,
    height: `${String(sourceBox.height)}px`,
    backgroundColor: opaqueBackground(host)
  });
  drawing.removeAttribute("style");
  drawing.setAttribute("width", String(sourceBox.width));
  drawing.setAttribute("height", String(sourceBox.height));
  drawing.style.maxWidth = "none";
  drawing.style.display = "block";
  drawing.style.marginLeft = `${String(sourceOffset)}px`;
  overlay.append(drawing);
  parent.append(overlay);
  let lastPosition = "";
  const frame = () => {
    const view = host.getBoundingClientRect();
    const container = parent.getBoundingClientRect();
    const liveSource = source.getBoundingClientRect();
    const top = liveSource.top - container.top + parent.scrollTop;
    const left = view.left - container.left + parent.scrollLeft;
    const playhead = Number(host.dataset.songCoursePlayhead ?? (host.clientWidth || view.width));
    const gap = Number(host.dataset.songCourseCursorGap ?? 12);
    const maskWidth = Math.max(0, Math.min(playhead - gap, sourceOffset + width));
    const position = `${String(left)},${String(top)},${String(maskWidth)}`;
    if (position === lastPosition) return;
    lastPosition = position;
    overlay.style.width = `${String(maskWidth)}px`;
    overlay.style.left = `${String(left)}px`;
    overlay.style.top = `${String(top)}px`;
  };
  host.addEventListener("scroll", frame, { passive: true });
  frame();
  return {
    frame,
    dispose() {
      host.removeEventListener("scroll", frame);
      overlay.remove();
    }
  };
}
