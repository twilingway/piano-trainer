import { CLAY_CLEF_URLS } from "./staffClayArt";
import { VexFlowMeasure, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import manifest from "./art/manifest.json";

const NS = "http://www.w3.org/2000/svg";
interface ClefAsset {
  readonly width: number;
  readonly height: number;
  readonly anchorNormalized: readonly number[];
}
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface DrawnClef {
  readonly type: string;
  readonly annotation?: unknown;
  getX(): number;
}
interface Anchor {
  readonly kind: "treble" | "bass";
  readonly x: number;
  readonly y: number;
}
const originalVisibility = new WeakMap<
  SVGElement,
  { value: string; priority: string; styled: boolean }
>();

/** Uniform fit whose musical anchor stays on the original staff line, inside existing ink. */
export function clayClefPlacement(box: Box, lineY: number, asset: ClefAsset): Box | undefined {
  const anchorY = asset.anchorNormalized[1];
  if (
    anchorY === undefined ||
    anchorY <= 0 ||
    anchorY >= 1 ||
    ![box.x, box.y, box.width, box.height, lineY, asset.width, asset.height].every(
      Number.isFinite
    ) ||
    box.width <= 0 ||
    box.height <= 0 ||
    asset.width <= 0 ||
    asset.height <= 0
  )
    return undefined;
  const scale = Math.min(
    box.width / asset.width,
    (lineY - box.y) / (asset.height * anchorY),
    (box.y + box.height - lineY) / (asset.height * (1 - anchorY))
  );
  if (!(scale > 0)) return undefined;
  const width = asset.width * scale;
  const height = asset.height * scale;
  return { x: box.x + (box.width - width) / 2, y: lineY - height * anchorY, width, height };
}

function restore(path: SVGElement): void {
  const previous = originalVisibility.get(path);
  if (previous) {
    if (previous.value) path.style.setProperty("visibility", previous.value, previous.priority);
    else path.style.removeProperty("visibility");
    if (!previous.styled && path.style.length === 0) path.removeAttribute("style");
  }
  originalVisibility.delete(path);
  delete path.dataset.clayClefOriginal;
}

function anchors(osmd: OpenSheetMusicDisplay): Anchor[] {
  const result: Anchor[] = [];
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      if (!(measure instanceof VexFlowMeasure)) continue;
      const stave = measure.getVFStave();
      for (const modifier of stave.getModifiers(undefined, "clefs")) {
        // VexFlow exposes these public runtime fields but its 1.x declarations omit them.
        const clef = modifier as unknown as DrawnClef;
        if ((clef.type !== "treble" && clef.type !== "bass") || clef.annotation) continue;
        result.push({
          kind: clef.type,
          x: clef.getX(),
          y: stave.getYForLine(clef.type === "treble" ? 3 : 1)
        });
      }
    }
  }
  return result;
}

/** A VexFlow glyph starts with its exact native pen anchor before its contour move. */
function glyphAnchor(group: SVGElement): { x: number; y: number } | undefined {
  const d = group.querySelector("path")?.getAttribute("d") ?? "";
  const match = /^M\s*([+-]?(?:\d*\.)?\d+)\s*[, ]\s*([+-]?(?:\d*\.)?\d+)\s*M/i.exec(d);
  if (!match) return undefined;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

/** Decorative only: unchanged source paths retain their layout bounds for fitting and rollback. */
export function applyStaffClayClefs(
  host: HTMLElement,
  enabled: boolean,
  osmd?: OpenSheetMusicDisplay
): void {
  for (const image of host.querySelectorAll("[data-clay-clef-image]")) image.remove();
  for (const path of host.querySelectorAll<SVGElement>("[data-clay-clef-original]")) restore(path);
  if (!enabled || !osmd) return;
  const candidates = anchors(osmd);
  for (const group of host.querySelectorAll<SVGGraphicsElement>("g.vf-clef")) {
    const at = glyphAnchor(group);
    if (!at || typeof group.getBBox !== "function") continue;
    const matches = candidates.filter(
      (c) => Math.abs(c.x - at.x) < 0.05 && Math.abs(c.y - at.y) < 0.05
    );
    const anchor = matches.length === 1 ? matches[0] : undefined;
    if (!anchor) continue;
    const asset = manifest.assets.find((a) => a.file === `${anchor.kind}-clay.webp`);
    if (!asset) continue;
    let box: DOMRect;
    try {
      box = group.getBBox();
    } catch {
      continue;
    }
    const position = clayClefPlacement(box, anchor.y, asset);
    if (!position) continue;
    const image = document.createElementNS(NS, "image");
    image.dataset.clayClefImage = anchor.kind;
    image.setAttribute("href", CLAY_CLEF_URLS[anchor.kind]);
    image.setAttribute("aria-hidden", "true");
    image.setAttribute("pointer-events", "none");
    for (const [key, value] of Object.entries(position)) image.setAttribute(key, String(value));
    const paths = [...group.querySelectorAll<SVGElement>("path")];
    for (const path of paths) {
      originalVisibility.set(path, {
        value: path.style.visibility,
        priority: path.style.getPropertyPriority("visibility"),
        styled: path.hasAttribute("style")
      });
      path.dataset.clayClefOriginal = "true";
      path.style.visibility = "hidden";
    }
    image.addEventListener(
      "error",
      () => {
        if (!image.isConnected || image.parentNode !== group) return;
        for (const path of paths) restore(path);
        image.remove();
      },
      { once: true }
    );
    // The bitmap already has broad baked lighting; a second SVG lighting pass would flatten its face.
    group.style.removeProperty("filter");
    group.append(image);
  }
}
