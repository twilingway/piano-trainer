import { STAFF_VERTICAL_SPACE } from "./staffSpacing";
import { installLocalNoteNames } from "./localNoteNames";
import { courseStaffXml, courseStaffZoom } from "./courseStaff";
import { fitCompactStaff } from "./fitCompactStaff";
import { lineBoxes } from "./staffViewport";
import { OpenSheetMusicDisplay, unitInPixels, type IOSMDOptions } from "opensheetmusicdisplay";

/**
 * How far a course's drawing reaches from its first staff's top line, in SVG units (OSMD units
 * times ten, whatever the zoom). The reach of an exercise's extreme prompts is the room every
 * prompt of it keeps, so the staff and the panel under it stand still from note to note.
 */
export interface CourseReach {
  /** The line's own box, page margins included: what the course zoom fits. */
  readonly line: number;
  /** Ink above the staff's top line. */
  readonly above: number;
  /** Ink below the staff's top line, cue rows included. */
  readonly below: number;
}

/** Vertical span in SVG units. */
export interface InkSpan {
  readonly top: number;
  readonly bottom: number;
}

/** Prompts measured once per exercise; a lesson rarely holds more than a few. */
const REACH_CACHE_SIZE = 16;
const reachCache = new Map<string, Promise<CourseReach | undefined>>();
/**
 * Off screen OSMD sets the cue row up to a fraction of a unit higher than on screen (measured:
 * 0.67 SVG units under C4 at zoom 3), so a measured prompt keeps this much more room.
 */
const REACH_SLACK = 1;
/** What a course's prompts really reached on screen, by the exercise's range. */
const drawnReach = new WeakMap<readonly string[], CourseReach>();

function widerReach(
  first: CourseReach | undefined,
  second: CourseReach | undefined
): CourseReach | undefined {
  if (!first || !second) return first ?? second;
  return {
    line: Math.max(first.line, second.line),
    above: Math.max(first.above, second.above),
    below: Math.max(first.below, second.below)
  };
}

function staffTop(osmd: OpenSheetMusicDisplay): number | undefined {
  const staff = osmd.GraphicSheet.MusicPages[0]?.MusicSystems[0]?.StaffLines[0];
  return staff ? staff.PositionAndShape.AbsolutePosition.y * unitInPixels : undefined;
}

/** The reach of a rendered score. */
export function courseReach(
  osmd: OpenSheetMusicDisplay,
  svg: SVGGraphicsElement
): CourseReach | undefined {
  const top = staffTop(osmd);
  const ink = svg.getBBox();
  if (top === undefined || !(ink.height > 0)) return undefined;
  return {
    line: lineExtent(osmd).height / osmd.Zoom,
    above: top - ink.y,
    below: ink.y + ink.height - top
  };
}

async function renderReach(
  xml: string,
  options: IOSMDOptions,
  host: HTMLElement
): Promise<CourseReach | undefined> {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:${String(host.clientWidth)}px`;
  box.style.font = getComputedStyle(host).font;
  document.body.append(box);
  try {
    const osmd = new OpenSheetMusicDisplay(box, options);
    await osmd.load(xml);
    installLocalNoteNames(osmd);
    osmd.EngravingRules.PageTopMargin = 2;
    osmd.Zoom = 1;
    osmd.render();
    const svg = box.querySelector("svg");
    const reach = svg ? courseReach(osmd, svg) : undefined;
    return (
      reach && {
        line: reach.line + 2 * REACH_SLACK,
        above: reach.above + REACH_SLACK,
        below: reach.below + REACH_SLACK
      }
    );
  } finally {
    box.remove();
  }
}

/**
 * The widest reach of a course's given prompts, each drawn once off screen as the course draws
 * it, with the staff's own options, widened by what its prompts already reached on screen.
 * Undefined when none could be measured: the course then fits each prompt alone.
 */
export async function measureCourseReach(
  prompts: readonly string[] | undefined,
  options: IOSMDOptions,
  host: HTMLElement
): Promise<CourseReach | undefined> {
  if (!prompts?.length) return undefined;
  const reaches = await Promise.all(
    prompts.map((xml) => {
      const key = `${JSON.stringify(options)}\n${xml}`;
      let reach = reachCache.get(key);
      if (!reach) {
        reach = renderReach(courseStaffXml(xml), options, host).catch(() => undefined);
        const oldest = reachCache.keys().next();
        if (reachCache.size >= REACH_CACHE_SIZE && !oldest.done) reachCache.delete(oldest.value);
        reachCache.set(key, reach);
      }
      return reach;
    })
  );
  return reaches.reduce(widerReach, drawnReach.get(prompts));
}

/** Remember what the prompt on screen reached: the exercise's next prompts keep that room too. */
export function noteCourseReach(
  prompts: readonly string[] | undefined,
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement
): void {
  const svg = host.querySelector("svg");
  const reach = svg && typeof svg.getBBox === "function" ? courseReach(osmd, svg) : undefined;
  const wider = prompts && widerReach(drawnReach.get(prompts), reach);
  if (prompts && wider) drawnReach.set(prompts, wider);
}

/** A line extent at least as tall as the reserved reach at the current zoom. */
function reservedExtent(
  line: { readonly width: number; readonly height: number },
  osmd: OpenSheetMusicDisplay,
  reach: CourseReach | undefined
): { width: number; height: number } {
  return reach
    ? { width: line.width, height: Math.max(line.height, reach.line * osmd.Zoom) }
    : line;
}

/** A measured line box stretched down to the reserved reach at the current zoom. */
function reservedLineBox(
  line: { readonly top: number; readonly bottom: number } | undefined,
  osmd: OpenSheetMusicDisplay,
  reach: CourseReach | undefined
): { top: number; bottom: number } | undefined {
  if (!line || !reach) return line;
  return { top: line.top, bottom: Math.max(line.bottom, line.top + reach.line * osmd.Zoom) };
}

/** Where the reserved reach lies around the rendered staff, in SVG units. */
export function reservedSpan(
  osmd: OpenSheetMusicDisplay,
  reach: CourseReach | undefined
): InkSpan | undefined {
  const top = reach ? staffTop(osmd) : undefined;
  return reach && top !== undefined
    ? { top: top - reach.above, bottom: top + reach.below }
    : undefined;
}

/** The drawn ink joined with the reserved span, in SVG units. */
function courseInk(svg: SVGGraphicsElement, reserved: InkSpan | undefined): InkSpan {
  const ink = svg.getBBox();
  const span = { top: ink.y, bottom: ink.y + ink.height };
  return reserved
    ? { top: Math.min(span.top, reserved.top), bottom: Math.max(span.bottom, reserved.bottom) }
    : span;
}

/** The first line's drawn size, page margins included, in pixels. */
export function lineExtent(osmd: OpenSheetMusicDisplay): { width: number; height: number } {
  const pixels = unitInPixels * osmd.Zoom;
  const first = osmd.GraphicSheet.MusicPages[0]?.MusicSystems[0]?.PositionAndShape;
  if (!first) return { width: 0, height: 0 };
  // The page margin on the left is mirrored on the right, as the staff's centring assumes.
  const width = (2 * first.AbsolutePosition.x + first.Size.width) * pixels;
  return { width, height: (first.BorderMarginBottom - first.BorderMarginTop) * pixels };
}

/** Render a course at the zoom that fits its line, the reserved reach included, into its room. */
export function fitCourseZoom(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  maxShare: number,
  reach: CourseReach | undefined
): void {
  osmd.Zoom = 1;
  osmd.render();
  osmd.Zoom *= courseStaffZoom(
    reservedExtent(lineExtent(osmd), osmd, reach),
    courseRoom(host, maxShare)
  );
  osmd.render();
  fitCompactStaff(osmd, host, reservedLineBox(lineBoxes(osmd)[0], osmd, reach));
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
export function showDrawing(host: HTMLElement, reserved?: InkSpan): void {
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
  const [, viewTop, , viewHeight] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  if (reserved && Number.isFinite(top) && viewTop !== undefined && viewHeight) {
    // The reserved room around the staff, from SVG units to the screen.
    const frame = svg.getBoundingClientRect();
    const scale = frame.height / viewHeight;
    top = Math.min(top, frame.top + (reserved.top - viewTop) * scale);
    bottom = Math.max(bottom, frame.top + (reserved.bottom - viewTop) * scale);
  }
  if (!Number.isFinite(top)) return;
  const view = host.getBoundingClientRect();
  const scrollbar = host.offsetHeight - host.clientHeight;
  const contentTop = top - view.top + host.scrollTop;
  host.style.height = `${String(Math.ceil(bottom - top + STAFF_VERTICAL_SPACE.top + STAFF_VERTICAL_SPACE.bottom + scrollbar))}px`;
  host.scrollTop = Math.max(0, contentTop - STAFF_VERTICAL_SPACE.top);
}

/** Fit all actual ink, including cue lyrics and the reserved reach, inside the lesson's CSS cap. */
export function fitCourseInk(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  reserved?: InkSpan
): void {
  const svg = host.querySelector("svg");
  const limit = Number.parseFloat(getComputedStyle(host).maxHeight);
  if (!svg || typeof svg.getBBox !== "function" || !Number.isFinite(limit)) return;
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const pixelHeight = Number.parseFloat(svg.getAttribute("height") ?? "");
  const unitHeight = viewBox.length === 4 ? viewBox[3] : pixelHeight;
  if (!(unitHeight && pixelHeight > 0)) return;
  const ink = courseInk(svg, reserved);
  const inkHeight = ((ink.bottom - ink.top) * pixelHeight) / unitHeight;
  const room = limit - STAFF_VERTICAL_SPACE.top - STAFF_VERTICAL_SPACE.bottom;
  if (room > 0 && inkHeight > room) {
    osmd.Zoom *= room / inkHeight;
    osmd.render();
  }
}

/**
 * Size a short exercise's SVG viewport to its actual ink before measuring beat positions, and
 * stretch it over the reserved reach. Changing the viewport, rather than moving the finished
 * score, keeps hit tests and cursor geometry in the same coordinate system. Long phrases retain
 * their scrolling width. Returns how far the drawing moved down, in pixels: OSMD's own line
 * boxes do not know the viewport grew above the page.
 */
export function fitCourseDrawing(host: HTMLElement, reserved?: InkSpan): number {
  const svg = host.querySelector("svg");
  if (!svg || typeof svg.getBBox !== "function") return 0;
  const data = svg.dataset;
  const currentWidth = svg.getAttribute("width");
  const currentHeight = svg.getAttribute("height");
  const currentViewBox = svg.getAttribute("viewBox") ?? "";
  const previousCrop =
    data.lessonCropWidth === currentWidth &&
    data.lessonCropHeight === (currentHeight ?? "") &&
    data.lessonCropViewBox === currentViewBox;
  const originalWidth = previousCrop ? (data.lessonWidth ?? currentWidth) : currentWidth;
  const originalHeight = previousCrop ? (data.lessonHeight ?? currentHeight) : currentHeight;
  const originalViewBox = previousCrop ? (data.lessonViewBox ?? currentViewBox) : currentViewBox;
  if (!originalWidth) return 0;
  data.lessonWidth = originalWidth;
  data.lessonHeight = originalHeight ?? "";
  data.lessonViewBox = originalViewBox;
  svg.setAttribute("width", originalWidth);
  if (originalHeight) svg.setAttribute("height", originalHeight);
  if (originalViewBox) svg.setAttribute("viewBox", originalViewBox);
  else svg.removeAttribute("viewBox");
  const ink = svg.getBBox();
  const previous = originalViewBox.split(/\s+/).map(Number);
  const [viewLeft = 0, viewTop = 0, viewWidth, viewHeight] = previous.length === 4 ? previous : [];
  const originalPixels = Number.parseFloat(originalWidth);
  const originalUnits = viewWidth ?? originalPixels;
  const scale = originalUnits ? originalPixels / originalUnits : 0;
  if (!(ink.width > 0 && scale > 0 && Number.isFinite(scale))) return 0;
  const height = viewHeight ?? Number.parseFloat(originalHeight ?? "");
  if (!(height > 0)) return 0;
  // OSMD Zoom changes physical SVG pixels, not its viewBox units.
  let left = viewLeft;
  let widthUnits = originalUnits;
  let widthPixels = originalPixels;
  const inkPixels = ink.width * scale;
  if (inkPixels <= host.clientWidth) {
    const paddingPixels = Math.max(0, Math.min(12, (host.clientWidth - inkPixels) / 2));
    left = ink.x - paddingPixels / scale;
    widthPixels = Math.min(host.clientWidth, Math.ceil(inkPixels + 2 * paddingPixels));
    widthUnits = widthPixels / scale;
  }
  const span = courseInk(svg, reserved);
  const top = Math.min(viewTop, span.top);
  const bottom = Math.max(viewTop + height, span.bottom);
  const stretched = top !== viewTop || bottom - top !== height;
  if (widthPixels === originalPixels && !stretched) return 0;
  const croppedViewBox = `${String(left)} ${String(top)} ${String(widthUnits)} ${String(bottom - top)}`;
  const heightPixels =
    stretched || !originalHeight ? String((bottom - top) * scale) : originalHeight;
  svg.setAttribute("width", String(widthPixels));
  svg.setAttribute("height", heightPixels);
  svg.setAttribute("viewBox", croppedViewBox);
  data.lessonCropWidth = String(widthPixels);
  data.lessonCropHeight = heightPixels;
  data.lessonCropViewBox = croppedViewBox;
  return (viewTop - top) * scale;
}
