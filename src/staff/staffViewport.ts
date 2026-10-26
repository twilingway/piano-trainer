import { STAFF_VERTICAL_SPACE } from "./staffSpacing";
import { unitInPixels, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const MAX_LINES = 3;

export interface ScrollTarget {
  left: number;
  top: number;
}

export interface LineBox {
  /** Pixels from the top of the score's SVG. */
  readonly top: number;
  readonly bottom: number;
}

/**
 * Each line of music with everything that belongs to it. A line's own box
 * leaves out fingerings and ledger notes above it, so it starts where the
 * line before it ends.
 */
export function lineBoxes(osmd: OpenSheetMusicDisplay): LineBox[] {
  const pixels = unitInPixels * osmd.Zoom;
  const systems = osmd.GraphicSheet.MusicPages[0]?.MusicSystems ?? [];
  return systems.map((system, index) => {
    const box = system.PositionAndShape;
    const own = (box.AbsolutePosition.y + box.BorderMarginTop) * pixels;
    const previous = systems[index - 1]?.PositionAndShape;
    const top = previous
      ? Math.min(own, (previous.AbsolutePosition.y + previous.BorderMarginBottom) * pixels)
      : own;
    return { top, bottom: (box.AbsolutePosition.y + box.BorderMarginBottom) * pixels };
  });
}

/** Percentage padding uses clientWidth; the followed cursor centres on the full border box. */
export function prepareStaffCursorPadding(host: HTMLElement, enabled: boolean): void {
  const page = host.querySelector<HTMLElement>(".staff-page");
  if (page)
    page.style.paddingInline = enabled ? `${String(host.getBoundingClientRect().width / 2)}px` : "";
}

/** Where the score's SVG sits inside the scroller's content, in pixels from its top. */
function svgOffset(scroller: HTMLElement): number {
  const svg = scroller.querySelector("svg");
  if (!svg) return 0;
  return (
    svg.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  );
}

/**
 * Where the view should be. One line: the note being played in the middle of
 * the screen. Wrapped: the cursor's line at the top, the next lines under it.
 */
export function scrollTarget(
  scroller: HTMLElement,
  cursor: HTMLElement,
  lines: readonly LineBox[],
  singleLine: boolean
): ScrollTarget {
  const box = scroller.getBoundingClientRect();
  const mark = cursor.getBoundingClientRect();
  const maxLeft = scroller.scrollWidth - scroller.clientWidth;
  const maxTop = scroller.scrollHeight - scroller.clientHeight;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
  const offset = svgOffset(scroller);
  const cursorY = mark.top - box.top + scroller.scrollTop - offset;
  const line = lines.filter((candidate) => candidate.top <= cursorY + 1).at(-1) ?? lines[0];
  const top = line
    ? clamp(offset + line.top - STAFF_VERTICAL_SPACE.top, maxTop)
    : scroller.scrollTop;
  if (!singleLine) return { left: scroller.scrollLeft, top };
  const shift = mark.left + mark.width / 2 - (box.left + box.width / 2);
  return { left: clamp(scroller.scrollLeft + shift, maxLeft), top };
}

/**
 * A score narrower than the page (a short piece on one line) is moved to the
 * middle of it; a full page of justified lines stays where it is.
 */
export function centreShortScore(osmd: OpenSheetMusicDisplay, page: HTMLElement): void {
  page.style.transform = "";
  const pixels = unitInPixels * osmd.Zoom;
  const systems = osmd.GraphicSheet.MusicPages[0]?.MusicSystems ?? [];
  if (systems.length === 0) return;
  const left = Math.min(...systems.map((system) => system.PositionAndShape.AbsolutePosition.x));
  const right = Math.max(
    ...systems.map(
      (system) => system.PositionAndShape.AbsolutePosition.x + system.PositionAndShape.Size.width
    )
  );
  const shift = (page.clientWidth - (left + right) * pixels) / 2;
  if (shift > 4) page.style.transform = `translateX(${String(Math.round(shift))}px)`;
}

/**
 * Sizes the view to whole lines of music: as many as fit in `maxShare` of
 * the window, one to three, so zooming changes how many lines show, not how
 * much of the screen the score takes.
 */
export function fitHeight(
  scroller: HTMLElement,
  lines: readonly LineBox[],
  singleLine: boolean,
  maxShare: number
): void {
  const first = lines[0];
  if (!first) return;
  const scrollbar = scroller.offsetHeight - scroller.clientHeight;
  if (singleLine) {
    scroller.style.height = `${String(Math.ceil(first.bottom - first.top + STAFF_VERTICAL_SPACE.top + STAFF_VERTICAL_SPACE.bottom + scrollbar))}px`;
    return;
  }
  // The tallest run of `count` lines anywhere in the score: later lines carry the gap
  // above them (fingers, ledger notes), so measuring from the first one cut them short.
  const tallest = (count: number) => {
    let height = 0;
    for (let index = 0; index + count <= lines.length; index++) {
      const top = lines[index]?.top ?? 0;
      const bottom = lines[index + count - 1]?.bottom ?? top;
      height = Math.max(height, bottom - top);
    }
    return height;
  };
  const room = Math.max(
    0,
    window.innerHeight * maxShare -
      STAFF_VERTICAL_SPACE.top -
      STAFF_VERTICAL_SPACE.bottom -
      scrollbar
  );
  let count = Math.min(MAX_LINES, lines.length);
  while (count > 1 && tallest(count) > room) count--;
  scroller.style.height = `${String(Math.ceil(tallest(count) + STAFF_VERTICAL_SPACE.top + STAFF_VERTICAL_SPACE.bottom + scrollbar))}px`;
}
