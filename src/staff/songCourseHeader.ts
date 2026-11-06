const GLYPHS = ".vf-clef, .vf-timesignature, .vf-keysignature";
const PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "fill-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight"
] as const;
let headerId = 0;

/** Clone only actual introductory symbols and staff lines, preserving their SVG transforms. */
function headerDrawing(
  source: SVGSVGElement,
  firstNoteX: number,
  railsOnly = false
): SVGSVGElement | undefined {
  const selected = new Set<Element>();
  if (!railsOnly)
    for (const glyph of source.querySelectorAll<SVGGraphicsElement>(GLYPHS)) {
      const box = glyph.getBoundingClientRect();
      if (box.width > 0 && box.right < firstNoteX) selected.add(glyph);
    }
  if (!railsOnly && !selected.size) return undefined;
  for (const line of source.querySelectorAll<SVGGraphicsElement>(
    ".vf-measure > path, .vf-stave > path"
  )) {
    const box = line.getBoundingClientRect();
    if (box.width > 1 && box.height <= 2) {
      selected.add(line);
      if (railsOnly && selected.size === 5) break;
    }
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

/** Fill only the empty run-up, below the real score and outside exported SVGs. */
function installRailBridge(
  host: HTMLElement,
  source: SVGSVGElement,
  sourceOffset: number,
  firstNoteX: number
) {
  const parent = host.parentElement;
  const drawing = headerDrawing(source, firstNoteX, true);
  const firstRail = [
    ...source.querySelectorAll<SVGGraphicsElement>(".vf-measure > path, .vf-stave > path")
  ].find((path) => {
    const box = path.getBoundingClientRect();
    return box.width > 1 && box.height <= 2;
  });
  if (!parent || !drawing || !firstRail) return undefined;
  const sourceBox = source.getBoundingClientRect();
  const viewWidth = source.viewBox.baseVal.width || sourceBox.width;
  const extension = viewWidth * (1 + host.getBoundingClientRect().width / sourceBox.width);
  for (const path of drawing.querySelectorAll(".vf-measure > path, .vf-stave > path")) {
    const numbers = (path.getAttribute("d") ?? "")
      .match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number);
    if (numbers?.length !== 4) continue;
    const [x, y, endX, endY] = numbers;
    if (x === undefined || y === undefined || endX === undefined || endY !== y) continue;
    path.setAttribute(
      "d",
      `M${String(x)} ${String(y)}L${String(Math.max(endX, x + extension))} ${String(y)}`
    );
  }
  drawing.removeAttribute("style");
  drawing.setAttribute("width", String(sourceBox.width));
  drawing.setAttribute("height", String(sourceBox.height));
  Object.assign(drawing.style, { maxWidth: "none", display: "block", overflow: "visible" });
  const layer = document.createElement("div");
  layer.className = "song-course-rail-bridge";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "absolute",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "0"
  });
  layer.append(drawing);
  parent.insertBefore(layer, host);
  let lastPosition = "";
  return {
    frame(maskWidth: number) {
      const view = host.getBoundingClientRect();
      const container = parent.getBoundingClientRect();
      const liveSource = source.getBoundingClientRect();
      const start = Math.max(0, maskWidth - 1);
      const end = Math.min(view.width, firstRail.getBoundingClientRect().left - view.left + 1);
      const width = Math.max(0, end - start);
      const left = view.left - container.left + parent.scrollLeft + start;
      const top = view.top - container.top + parent.scrollTop;
      const drawingTop = liveSource.top - view.top;
      const position = `${String(left)},${String(top)},${String(width)},${String(view.height)},${String(drawingTop)}`;
      if (position === lastPosition) return;
      lastPosition = position;
      layer.style.left = `${String(left)}px`;
      layer.style.top = `${String(top)}px`;
      layer.style.width = `${String(width)}px`;
      layer.style.height = `${String(view.height)}px`;
      drawing.style.marginLeft = `${String(sourceOffset - start)}px`;
      drawing.style.marginTop = `${String(drawingTop)}px`;
    },
    dispose() {
      layer.remove();
    }
  };
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
  // Derive the fixed copy from score coordinates, never from the temporary count-in scroll.
  const anchor = host.dataset.songCoursePlayhead;
  const sourceOffset =
    anchor === undefined
      ? sourceBox.left - host.getBoundingClientRect().left
      : Number(anchor) - (firstBox.left + firstBox.width / 2 - sourceBox.left);
  const movingGlyphs = [...source.querySelectorAll<SVGGraphicsElement>(GLYPHS)].filter((glyph) => {
    const box = glyph.getBoundingClientRect();
    return box.width > 0 && box.right < firstBox.left;
  });
  const glyphs = movingGlyphs.map((glyph) => glyph.getBoundingClientRect());
  const introRight = Math.max(...glyphs.map((box) => box.right - sourceBox.left));
  const width = Math.min(firstBox.left - sourceBox.left - 6, introRight + 6);
  if (!(width > 0 && sourceBox.height > 0)) return undefined;
  // External CSS hides only this reader copy; standalone SVG exports retain the original symbols.
  for (const glyph of movingGlyphs) glyph.setAttribute("data-song-course-prefix", "");
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
  const bridge = installRailBridge(host, source, sourceOffset, firstBox.left);
  let lastPosition = "";
  const frame = () => {
    const view = host.getBoundingClientRect();
    const container = parent.getBoundingClientRect();
    const liveSource = source.getBoundingClientRect();
    const top = view.top - container.top + parent.scrollTop;
    const drawingTop = liveSource.top - view.top;
    const left = view.left - container.left + parent.scrollLeft;
    const playhead = Number(host.dataset.songCoursePlayhead ?? (host.clientWidth || view.width));
    const gap = Number(host.dataset.songCourseCursorGap ?? 12);
    const maskWidth = Math.max(0, Math.min(playhead - gap, sourceOffset + width));
    bridge?.frame(maskWidth);
    const position = `${String(left)},${String(top)},${String(maskWidth)},${String(view.height)},${String(drawingTop)}`;
    if (position === lastPosition) return;
    lastPosition = position;
    overlay.style.width = `${String(maskWidth)}px`;
    overlay.style.left = `${String(left)}px`;
    overlay.style.top = `${String(top)}px`;
    overlay.style.height = `${String(view.height)}px`;
    drawing.style.marginTop = `${String(drawingTop)}px`;
  };
  host.addEventListener("scroll", frame, { passive: true });
  frame();
  return {
    frame,
    dispose() {
      host.removeEventListener("scroll", frame);
      for (const glyph of movingGlyphs) glyph.removeAttribute("data-song-course-prefix");
      overlay.remove();
      bridge?.dispose();
    }
  };
}
