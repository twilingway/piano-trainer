import { unitInPixels, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

/** Air left above and below a course's drawing, px. */
const DRAWING_GAP_PX = 4;

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
  const height = (workspace?.clientHeight ?? window.innerHeight) * maxShare;
  return { width: host.clientWidth - 16, height };
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
  host.style.height = `${String(Math.ceil(bottom - top + 2 * DRAWING_GAP_PX + scrollbar))}px`;
  host.scrollTop = Math.max(0, contentTop - DRAWING_GAP_PX);
}
