import type { StaffWorldSnapshot } from "../../staff/staffWorldSnapshot";
export interface ScoreTile {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly viewLeft: number;
  readonly viewTop: number;
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly pixelsWide: number;
  readonly pixelsHigh: number;
}
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
/** Raster work changes only at tile boundaries; the UV window and cursor may move every frame. */
export function worldScoreTile(
  snapshot: StaffWorldSnapshot,
  x: number,
  y: number,
  limit: number
): ScoreTile {
  const max = Math.max(1, Math.min(4096, limit));
  const viewWidth = Math.min(snapshot.width, Math.max(1, snapshot.viewportWidth));
  const viewHeight = Math.min(snapshot.height, Math.max(1, snapshot.viewportHeight));
  const viewLeft = clamp(x - viewWidth * 0.45, snapshot.width - viewWidth);
  const viewTop = clamp(y - 20, snapshot.height - viewHeight);
  const width = Math.min(snapshot.width, viewWidth * 2),
    height = Math.min(snapshot.height, viewHeight * 2);
  const left = clamp(
    Math.floor(viewLeft / (viewWidth * 0.75)) * viewWidth * 0.75,
    snapshot.width - width
  );
  const top = clamp(
    Math.floor(viewTop / (viewHeight * 0.75)) * viewHeight * 0.75,
    snapshot.height - height
  );
  const rasterScale = Math.min(1, max / width, max / height);
  return {
    left,
    top,
    width,
    height,
    viewLeft,
    viewTop,
    viewWidth,
    viewHeight,
    pixelsWide: Math.max(1, Math.ceil(width * rasterScale)),
    pixelsHigh: Math.max(1, Math.ceil(height * rasterScale))
  };
}
export function scoreTileSvg(svg: string, tile: ScoreTile): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root.localName !== "svg" || root.querySelector("parsererror"))
    throw new Error("Invalid staff SVG");
  root.setAttribute("width", String(tile.pixelsWide));
  root.setAttribute("height", String(tile.pixelsHigh));
  root.setAttribute("preserveAspectRatio", "none");
  root.setAttribute(
    "viewBox",
    `${String(tile.left)} ${String(tile.top)} ${String(tile.width)} ${String(tile.height)}`
  );
  return new XMLSerializer().serializeToString(root);
}
