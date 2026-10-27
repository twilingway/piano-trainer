import { STAFF_VERTICAL_SPACE } from "./staffSpacing";
import { unitInPixels, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

/** The first line's drawn size, page margins included, in pixels. */
export function lineExtent(osmd: OpenSheetMusicDisplay): { width: number; height: number } {
  const pixels = unitInPixels * osmd.Zoom;
  const first = osmd.GraphicSheet.MusicPages[0]?.MusicSystems[0]?.PositionAndShape;
  if (!first) return { width: 0, height: 0 };
  // The page margin on the left is mirrored on the right, as the staff's centring assumes.
  const width = (2 * first.AbsolutePosition.x + first.Size.width) * pixels;
  return { width, height: (first.BorderMarginBottom - first.BorderMarginTop) * pixels };
}

/** What a course's staff may fill: the reader's width and its share of the workspace height. */
export function courseRoom(host: HTMLElement, maxShare: number): { width: number; height: number } {
  const workspace = host.closest(".workspace-main");
  const requestedHeight = (workspace?.clientHeight ?? window.innerHeight) * maxShare;
  const cssHeight = Number.parseFloat(getComputedStyle(host).maxHeight);
  const height = Number.isFinite(cssHeight)
    ? Math.min(requestedHeight, cssHeight)
    : requestedHeight;
  return {
    width: host.clientWidth - 16,
    height: Math.max(1, height - STAFF_VERTICAL_SPACE.top - STAFF_VERTICAL_SPACE.bottom)
  };
}

/**
 * A course's exercise fits on screen whole: the view is sized to what is drawn,
 * the clef above the line's own box included, and the page's empty margins left out.
 */
export function showDrawing(host: HTMLElement): void {
  const svg = host.querySelector("svg");
  if (!svg) return;
  let top = Infinity;
  let bottom = -Infinity;
  for (const part of svg.children) {
    const box = part.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    top = Math.min(top, box.top);
    bottom = Math.max(bottom, box.bottom);
  }
  if (!Number.isFinite(top)) return;
  const view = host.getBoundingClientRect();
  const scrollbar = host.offsetHeight - host.clientHeight;
  const contentTop = top - view.top + host.scrollTop;
  host.style.height = `${String(Math.ceil(bottom - top + STAFF_VERTICAL_SPACE.top + STAFF_VERTICAL_SPACE.bottom + scrollbar))}px`;
  host.scrollTop = Math.max(0, contentTop - STAFF_VERTICAL_SPACE.top);
}

/** Fit all actual ink, including cue lyrics, inside the same CSS cap used by the lesson. */
export function fitCourseInk(osmd: OpenSheetMusicDisplay, host: HTMLElement): void {
  const svg = host.querySelector("svg");
  const limit = Number.parseFloat(getComputedStyle(host).maxHeight);
  if (!svg || typeof svg.getBBox !== "function" || !Number.isFinite(limit)) return;
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const pixelHeight = Number.parseFloat(svg.getAttribute("height") ?? "");
  const unitHeight = viewBox.length === 4 ? viewBox[3] : pixelHeight;
  if (!(unitHeight && pixelHeight > 0)) return;
  const inkHeight = (svg.getBBox().height * pixelHeight) / unitHeight;
  const room = limit - STAFF_VERTICAL_SPACE.top - STAFF_VERTICAL_SPACE.bottom;
  if (room > 0 && inkHeight > room) {
    osmd.Zoom *= room / inkHeight;
    osmd.render();
  }
}

/**
 * Size a short exercise's SVG viewport to its actual ink before measuring beat positions.
 * Changing the viewport, rather than moving the finished score, keeps hit tests and cursor
 * geometry in the same coordinate system. Long phrases retain their scrolling viewport.
 */
export function fitCourseDrawing(host: HTMLElement): void {
  const svg = host.querySelector("svg");
  if (!svg || typeof svg.getBBox !== "function") return;
  const currentWidth = svg.getAttribute("width");
  const currentViewBox = svg.getAttribute("viewBox") ?? "";
  const previousCrop =
    svg.dataset.lessonCropWidth === currentWidth &&
    svg.dataset.lessonCropViewBox === currentViewBox;
  const originalWidth = previousCrop ? (svg.dataset.lessonWidth ?? currentWidth) : currentWidth;
  const originalViewBox = previousCrop
    ? (svg.dataset.lessonViewBox ?? currentViewBox)
    : currentViewBox;
  if (!originalWidth) return;
  svg.dataset.lessonWidth = originalWidth;
  svg.dataset.lessonViewBox = originalViewBox;
  svg.setAttribute("width", originalWidth);
  if (originalViewBox) svg.setAttribute("viewBox", originalViewBox);
  else svg.removeAttribute("viewBox");
  const ink = svg.getBBox();
  const previous = originalViewBox.split(/\s+/).map(Number);
  const originalPixels = Number.parseFloat(originalWidth);
  const originalUnits = previous.length === 4 ? previous[2] : originalPixels;
  const scale = originalUnits ? originalPixels / originalUnits : 0;
  if (!(ink.width > 0 && scale > 0 && Number.isFinite(scale))) return;
  // OSMD Zoom changes physical SVG pixels, not its viewBox units.
  const inkPixels = ink.width * scale;
  if (inkPixels > host.clientWidth) return;
  const paddingPixels = Math.max(0, Math.min(12, (host.clientWidth - inkPixels) / 2));
  const padding = paddingPixels / scale;
  const widthPixels = Math.min(host.clientWidth, Math.ceil(inkPixels + 2 * paddingPixels));
  const widthUnits = widthPixels / scale;
  const height =
    previous.length === 4 ? previous[3] : Number.parseFloat(svg.getAttribute("height") ?? "");
  const top = previous.length === 4 ? previous[1] : 0;
  if (!(height && height > 0)) return;
  const croppedViewBox = `${String(ink.x - padding)} ${String(top)} ${String(widthUnits)} ${String(height)}`;
  svg.setAttribute("width", String(widthPixels));
  svg.setAttribute("viewBox", croppedViewBox);
  svg.dataset.lessonCropWidth = String(widthPixels);
  svg.dataset.lessonCropViewBox = croppedViewBox;
}
