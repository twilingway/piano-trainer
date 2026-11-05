import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { songCourseNoteWindow, songCourseStaffOffset } from "../songCourse/progressView";
import { indexNotes } from "./staffNoteIndex";
import type { BeatSpot } from "./liveCursor";

export interface SongCourseViewportNote {
  readonly x: number;
  readonly width: number;
}

/** Keep a clef zone on narrow screens and leave most of a wide viewport for upcoming notes. */
export function songCoursePlayhead(width: number): number {
  return Math.min(320, Math.max(0, width) * 0.4);
}

/** Fit every real four-event window; a partial ending contributes only its real notes. */
export function songCourseDensityScale(
  width: number,
  notes: readonly SongCourseViewportNote[]
): number {
  const first = notes[0];
  if (!(width > 0) || !first) return 1;
  const playhead = songCoursePlayhead(width);
  const edge = Math.min(12, width / 24);
  let scale = Math.min(1, (playhead - edge) / Math.max(first.x, 1));
  for (const [index, note] of notes.entries()) {
    const window = songCourseNoteWindow(notes, index);
    const reach = Math.max(...window.map((item) => item.x + item.width / 2 - note.x));
    scale = Math.min(
      scale,
      (width - playhead - edge) / Math.max(1, reach),
      40 / Math.max(1, note.width)
    );
  }
  return Math.max(0.01, scale);
}

/** Course-only baseline cap; ordinary lesson zoom and saved reader preferences stay untouched. */
export function fitSongCourseViewport(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  enabled: boolean
): void {
  delete host.dataset.songCoursePlayhead;
  delete host.dataset.songCourseCentered;
  if (!enabled) return;
  const width = host.clientWidth;
  const playhead = songCoursePlayhead(width);
  host.dataset.songCoursePlayhead = String(playhead);
  const page = host.querySelector<HTMLElement>(".staff-page");
  if (page)
    page.style.paddingInline = `${String(playhead)}px ${String(Math.max(0, width - playhead))}px`;
  const svg = host.querySelector("svg");
  if (!svg) return;
  const origin = svg.getBoundingClientRect().left;
  const notes = [...(indexNotes(osmd).feedbackHeads ?? [])]
    .map(([key, heads]) => {
      const box = heads[0]?.getBoundingClientRect();
      return {
        beat: Number(key.split(":")[0]),
        x: box ? box.left + box.width / 2 - origin : 0,
        width: box?.width ?? 0
      };
    })
    .filter((note) => note.width > 0)
    .sort((a, b) => a.beat - b.beat);
  const scale = songCourseDensityScale(width, notes);
  if (scale < 0.999) {
    osmd.Zoom *= scale;
    osmd.render();
  }
}

/** Final cropped ink that fits whole stays centred; only a genuinely long score scrolls. */
export function frameSongCourseDrawing(host: HTMLElement): void {
  delete host.dataset.songCourseCentered;
  if (host.dataset.songCoursePlayhead === undefined) return;
  const svg = host.querySelector("svg");
  const page = host.querySelector<HTMLElement>(".staff-page");
  if (!svg || !page) return;
  if (svg.getBoundingClientRect().width <= host.clientWidth + 0.5) {
    host.dataset.songCourseCentered = "true";
    page.style.paddingInline = "0px";
    host.scrollLeft = 0;
  }
}

/** Reads the same beat as the normal staff cursor; no easing, timer or independent clock. */
export function positionSongCourseViewport(
  host: HTMLElement,
  spots: readonly BeatSpot[],
  beat: number
): boolean {
  if (host.dataset.songCourseCentered === "true") {
    host.scrollLeft = 0;
    return true;
  }
  const value = host.dataset.songCoursePlayhead;
  const svg = host.querySelector("svg");
  if (value === undefined || !svg || !spots.length) return false;
  const playhead = Number(value);
  const svgLeft =
    svg.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft;
  host.scrollLeft = svgLeft - songCourseStaffOffset(spots, beat, playhead);
  return true;
}

export function songCourseCursorAnchor(
  host: HTMLElement | null,
  following: boolean
): { readonly anchorX?: number } {
  const value = host?.dataset.songCoursePlayhead;
  return following && value !== undefined && host?.dataset.songCourseCentered !== "true"
    ? { anchorX: Number(value) }
    : {};
}

/** Grow only the vertical viewport for rendered labels; the horizontal density and scale stay fixed. */
export function fitSongCourseLabelBounds(host: HTMLElement): number {
  if (host.dataset.songCoursePlayhead === undefined) return 0;
  const svg = host.querySelector("svg");
  if (!svg) return 0;
  const frame = svg.getBoundingClientRect();
  const view = (svg.getAttribute("viewBox") ?? "").trim().split(/\s+/).map(Number);
  const [left, top, width, height] = view;
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    !height ||
    frame.height <= 0
  )
    return 0;
  let inkTop = frame.top;
  let inkBottom = frame.bottom;
  for (const text of svg.querySelectorAll("text")) {
    if (!text.textContent.trim()) continue;
    const bounds = text.getBoundingClientRect();
    if (!(bounds.width > 0 && bounds.height > 0)) continue;
    inkTop = Math.min(inkTop, bounds.top);
    inkBottom = Math.max(inkBottom, bounds.bottom);
  }
  const extraTop = inkTop < frame.top ? frame.top - inkTop + 4 : 0;
  const extraBottom = inkBottom > frame.bottom ? inkBottom - frame.bottom + 4 : 0;
  if (extraTop === 0 && extraBottom === 0) return 0;
  const unitsPerPixel = height / frame.height;
  const newHeight = frame.height + extraTop + extraBottom;
  const newViewBox = `${String(left)} ${String(top - extraTop * unitsPerPixel)} ${String(width)} ${String(newHeight * unitsPerPixel)}`;
  svg.setAttribute("height", String(newHeight));
  svg.setAttribute("viewBox", newViewBox);
  if (svg.parentElement) svg.parentElement.style.height = `${String(newHeight)}px`;
  // The generic crop restores its original geometry on the next render, including this enlargement.
  svg.dataset.lessonCropHeight = String(newHeight);
  svg.dataset.lessonCropViewBox = newViewBox;
  return extraTop;
}

/**
 * Fit the final cropped drawing, including rendered name/finger labels, in its allocated row.
 * OSMD rerenders at a uniform zoom before any note/cursor coordinates are indexed.
 * Only the responsive melody shell opts in; legacy manually enlarged lessons keep scrolling.
 */
export function fitSongCourseRoom(
  osmd: OpenSheetMusicDisplay,
  host: HTMLElement,
  draw: () => number
): number {
  let shift = draw();
  const room = host.closest<HTMLElement>(".song-course-lesson__score");
  if (!room || host.dataset.songCoursePlayhead === undefined) return shift;
  const limit = room.clientHeight;
  if (!(limit > 1)) return shift;
  // Crop padding and font bounds may change slightly after a render, so measure again.
  for (let pass = 0; pass < 4; pass++) {
    const svg = host.querySelector("svg");
    if (!svg) break;
    const scrollbar = Math.max(0, host.offsetHeight - host.clientHeight);
    const height = svg.getBoundingClientRect().height + scrollbar;
    if (!(height > limit + 0.5)) break;
    const scale = Math.max(0.01, (limit - 1) / height);
    if (!(Number.isFinite(scale) && scale < 1)) break;
    osmd.Zoom *= scale;
    osmd.render();
    shift = draw();
  }
  return shift;
}
