import { placeCursorLine, spotAt } from "./liveCursor";
import { fitCompactStaff, staffZoom } from "./fitCompactStaff";
import { setStaffTempoLayout } from "./staffTempoLayout";
import {
  highlightUnderCursor,
  noteheadShapes,
  paintMarks,
  paintStaffFingerings,
  paintStaffNotes,
  setStaffColors
} from "./staffNoteColors";
import type { BeatSpot } from "./liveCursor";
import { OpenSheetMusicDisplay, VexFlowGraphicalNote, unitInPixels } from "opensheetmusicdisplay";
import { useEffect, useEffectEvent, useRef } from "react";

interface StaffProps {
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
  /** 1 = OSMD's own size. */
  readonly zoom: number;
  readonly noteColor: string;
  readonly scoreColor: string;
  /** One endless line that scrolls sideways, or systems wrapped to the width like a printed page. */
  readonly singleLine: boolean;
  /** Keep the cursor in view as the song plays. */
  readonly follow: boolean;
  /** Finger numbers over and under the notes. */
  readonly fingers: boolean;
  readonly fingerColors: "mono" | "fingers";
  /** Break lines where the score says so (the fixed measures-per-line layout) instead of by width. */
  readonly breaksFromScore: boolean;
  /** A click on the score: the beat of the note nearest to it. */
  readonly onSeek?: (beat: number) => void;
  /** Notehead colours by markKey(beat, pitch): the review of the last take. */
  readonly marks?: ReadonlyMap<string, string> | undefined;
  /** Where the song is right now in quarters; a single line scrolls with it every frame. */
  readonly liveBeat?: () => number;
  /** Share of the window this staff may take; two staves stacked take less each. */
  readonly maxShare?: number;
}

const BEAT_EPSILON = 1e-6;
/** Share of the remaining distance the view covers each frame: a glide, not a jump. */
const GLIDE = 0.12;
/** Share of the window the score may take; the lines that fit decide the exact height. */
const DEFAULT_MAX_SHARE = 0.45;
/** Time constant of the single line's easing, seconds: long enough to hide a note's jolt. */
const LIVE_SMOOTHING_S = 0.35;
/** How long the reader's scrolling keeps the line from following the song, ms. */
const MANUAL_SCROLL_HOLD_MS = 2500;
/** Movement that turns a press on the score from a click into a drag, px. */
const DRAG_THRESHOLD_PX = 5;
const MAX_LINES = 3;
/** Air left above a line when it is scrolled to the top. */
const LINE_TOP_GAP_PX = 4;

function cursorBeat(osmd: OpenSheetMusicDisplay): number {
  // OSMD counts in whole notes.
  return osmd.cursor.Iterator.currentTimeStamp.RealValue * 4;
}

/** Walks the cursor to the last entry at or before `beat`. */
function moveCursor(osmd: OpenSheetMusicDisplay, beat: number): void {
  const cursor = osmd.cursor;
  if (cursorBeat(osmd) > beat + BEAT_EPSILON) cursor.reset();
  for (;;) {
    const peek = cursor.Iterator.clone();
    peek.moveToNext();
    if (peek.EndReached || peek.currentTimeStamp.RealValue * 4 > beat + BEAT_EPSILON) break;
    cursor.next();
  }
}

/** The key a mark is given under: the note's beat and MIDI pitch. */
export function markKey(beat: number, pitch: number): string {
  return `${String(Math.round(beat * 1000) / 1000)}:${String(pitch)}`;
}

interface ScrollTarget {
  left: number;
  top: number;
}

interface LineBox {
  /** Pixels from the top of the score's SVG. */
  readonly top: number;
  readonly bottom: number;
}

/**
 * Each line of music with everything that belongs to it. A line's own box
 * leaves out fingerings and ledger notes above it, so it starts where the
 * line before it ends.
 */
function lineBoxes(osmd: OpenSheetMusicDisplay): LineBox[] {
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
function scrollTarget(
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
  const top = line ? clamp(offset + line.top - LINE_TOP_GAP_PX, maxTop) : scroller.scrollTop;
  if (!singleLine) return { left: scroller.scrollLeft, top };
  const shift = mark.left + mark.width / 2 - (box.left + box.width / 2);
  return { left: clamp(scroller.scrollLeft + shift, maxLeft), top };
}

/** Every drawn note of the score with the beat it starts on, for clicks on the staff. */
interface NoteIndex {
  /** Each drawn note with its beat, for clicks. */
  readonly beats: Map<SVGGElement, number>;
  /** Noteheads by markKey, for the review colours. */
  readonly heads: Map<string, SVGElement[]>;
}

function indexNotes(osmd: OpenSheetMusicDisplay): NoteIndex {
  const beats = new Map<SVGGElement, number>();
  const heads = new Map<string, SVGElement[]>();
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const measure of row) {
      // OSMD's measure rows have holes for staves without a measure there.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!measure) continue;
      for (const entry of measure.staffEntries) {
        const beat = entry.getAbsoluteTimestamp().RealValue * 4;
        for (const voice of entry.graphicalVoiceEntries) {
          for (const note of voice.notes) {
            if (!(note instanceof VexFlowGraphicalNote) || note.sourceNote.isRest()) continue;
            beats.set(note.getSVGGElement(), beat);
            // OSMD counts half tones from C0; MIDI from C-1.
            const key = markKey(beat, note.sourceNote.halfTone + 12);
            heads.set(key, [...(heads.get(key) ?? []), ...noteheadShapes(note)]);
          }
        }
      }
    }
  }
  return { beats, heads };
}

/** Every beat that has a note: that note's x centre from the SVG's left edge, and its line. */
function beatPositions(
  beats: ReadonlyMap<SVGGElement, number>,
  host: HTMLElement,
  lines: readonly LineBox[]
): BeatSpot[] {
  const svg = host.querySelector("svg");
  if (!svg) return [];
  const origin = svg.getBoundingClientRect();
  const byBeat = new Map<number, BeatSpot>();
  for (const [element, beat] of beats) {
    const box = element.getBoundingClientRect();
    if (box.width === 0) continue;
    const x = box.left + box.width / 2 - origin.left;
    const y = box.top + box.height / 2 - origin.top;
    const line = (lines.filter((item) => item.top <= y).at(-1) ?? lines[0])?.top ?? 0;
    const known = byBeat.get(beat);
    if (!known || x < known.x) byBeat.set(beat, { beat, x, line });
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

/**
 * A score narrower than the page (a short piece on one line) is moved to the
 * middle of it; a full page of justified lines stays where it is.
 */
function centreShortScore(osmd: OpenSheetMusicDisplay, page: HTMLElement): void {
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
function fitHeight(
  scroller: HTMLElement,
  lines: readonly LineBox[],
  singleLine: boolean,
  maxShare: number
): void {
  const first = lines[0];
  if (!first) return;
  const scrollbar = scroller.offsetHeight - scroller.clientHeight;
  if (singleLine) {
    scroller.style.height = `${String(Math.ceil(first.bottom - first.top + LINE_TOP_GAP_PX + scrollbar))}px`;
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
  const room = window.innerHeight * maxShare;
  let count = Math.min(MAX_LINES, lines.length);
  while (count > 1 && tallest(count) > room) count--;
  scroller.style.height = `${String(Math.ceil(tallest(count) + LINE_TOP_GAP_PX * 2 + scrollbar))}px`;
}

/**
 * The score under a cursor that follows the song by beats rather than by
 * seconds, so tempo changes cannot drift it off; the notes under it are
 * coloured. Zoom, line wrapping and following are the reader's choice.
 */
export function Staff({
  musicXml,
  beat,
  zoom,
  noteColor,
  scoreColor,
  singleLine,
  follow,
  fingers,
  fingerColors,
  breaksFromScore,
  onSeek,
  marks,
  maxShare = DEFAULT_MAX_SHARE,
  liveBeat
}: StaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** OSMD draws here; the host around it scrolls. */
  const pageRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const paintedRef = useRef<SVGElement[]>([]);
  // Read by the loader and the zoom effect, which must land the cursor where the song is.
  const latest = useRef({ beat, zoom, follow, singleLine, maxShare });
  const targetRef = useRef<ScrollTarget | null>(null);
  const linesRef = useRef<LineBox[]>([]);
  const noteIndexRef = useRef<NoteIndex>({ beats: new Map(), heads: new Map() });
  /** Each beat that has a note, with that note's x from the SVG's left edge and its line. */
  const beatXRef = useRef<BeatSpot[]>([]);
  /** The play cursor: a thin glowing line gliding with the song, over OSMD's own. */
  const cursorLineRef = useRef<HTMLDivElement>(null);
  const liveBeatRef = useRef(liveBeat);
  const marksRef = useRef(marks);

  useEffect(() => {
    latest.current = { beat, zoom, follow, singleLine, maxShare };
  });

  const showBeat = useEffectEvent((osmd: OpenSheetMusicDisplay, host: HTMLElement) => {
    moveCursor(osmd, latest.current.beat);
    paintedRef.current = highlightUnderCursor(osmd, paintedRef.current);
    // A single line with a live position scrolls every frame on its own and needs no steering.
    const live = latest.current.singleLine && liveBeatRef.current !== undefined;
    if (latest.current.follow) {
      const target = scrollTarget(
        host,
        osmd.cursor.cursorElement,
        linesRef.current,
        latest.current.singleLine
      );
      // Live, the line is placed once by relayout and moved by the frame loop alone:
      // a second steer here pulled it back to where it stood when the note began.
      targetRef.current = live ? null : target;
    }
  });

  /** Renders at the current size and zoom, then measures the lines and puts the cursor back. */
  const relayout = useEffectEvent((osmd: OpenSheetMusicDisplay, host: HTMLElement) => {
    setStaffColors(osmd, noteColor, scoreColor);
    osmd.Zoom = staffZoom(host, latest.current.zoom);
    osmd.render();
    fitCompactStaff(osmd, host, lineBoxes(osmd)[0]);
    paintStaffNotes(osmd, noteColor);
    paintStaffFingerings(osmd, fingerColors, scoreColor);
    const page = pageRef.current;
    if (page) {
      if (latest.current.singleLine) page.style.transform = "";
      else centreShortScore(osmd, page);
    }
    linesRef.current = lineBoxes(osmd);
    noteIndexRef.current = indexNotes(osmd);
    beatXRef.current = beatPositions(noteIndexRef.current.beats, host, linesRef.current);
    paintMarks(noteIndexRef.current.heads, marksRef.current);
    fitHeight(host, linesRef.current, latest.current.singleLine, latest.current.maxShare);
    // A new render draws new noteheads and puts the cursor back at the start.
    paintedRef.current = [];
    osmd.cursor.reset();
    showBeat(osmd, host);
    // The page under the view has changed: jump to the cursor's line at once instead of gliding.
    const target = scrollTarget(
      host,
      osmd.cursor.cursorElement,
      linesRef.current,
      latest.current.singleLine
    );
    host.scrollLeft = target.left;
    host.scrollTop = target.top;
    targetRef.current = null;
  });

  useEffect(() => {
    const host = hostRef.current;
    const page = pageRef.current;
    if (!host || !page) return;
    let cancelled = false;
    let resizeTimer = 0;
    const osmd = new OpenSheetMusicDisplay(page, {
      backend: "svg",
      defaultColorMusic: getComputedStyle(host).getPropertyValue("--accent").trim(),
      // Re-flowing on resize is done below, so the line sizes are measured again too.
      autoResize: false,
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      // OSMD leaves them off for a one-part score; here the reader chooses.
      drawFingerings: fingers,
      renderSingleHorizontalStaffline: singleLine,
      followCursor: false,
      newSystemFromXML: breaksFromScore,
      // Eighths and shorter are beamed beat by beat, so each beat reads as one group at a glance.
      autoBeam: true,
      autoBeamOptions: { groups: [[1, 4]] }
    });
    void osmd.load(musicXml).then(() => {
      if (cancelled) return;
      setStaffTempoLayout(osmd, musicXml);
      osmd.Zoom = latest.current.zoom;
      // Half the usual page margin: the view starts at the first line anyway.
      osmd.EngravingRules.PageTopMargin = 2;
      // A fixed count per line gets equal measures, so barlines line up from line to line.
      osmd.EngravingRules.FixedMeasureWidth = breaksFromScore;
      osmd.render();
      osmd.cursor.show();
      osmdRef.current = osmd;
      relayout(osmd, host);
    });
    // Wrapped pages re-flow; a compact single line also fits the space above the keys.
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (osmdRef.current === osmd) relayout(osmd, host);
      }, 200);
    };
    window.addEventListener("resize", onResize);
    const workspace = host.closest(".workspace-main");
    const resizeObserver = new ResizeObserver(onResize);
    if (workspace) resizeObserver.observe(workspace);
    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      osmdRef.current = null;
      osmd.clear();
      // clear() empties the score but leaves its sized SVG behind, stacked over the next one.
      page.replaceChildren();
    };
  }, [musicXml, singleLine, breaksFromScore, fingers]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    relayout(osmd, host);
  }, [zoom, noteColor, scoreColor, fingerColors]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    showBeat(osmd, host);
  }, [beat]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (osmd && host) relayout(osmd, host);
  }, [maxShare]);

  useEffect(() => {
    liveBeatRef.current = liveBeat;
  }, [liveBeat]);

  useEffect(() => {
    marksRef.current = marks;
    paintMarks(noteIndexRef.current.heads, marks);
  }, [marks]);

  // The view glides towards its target every frame instead of jumping on each note.
  useEffect(() => {
    let frame = 0;
    let lastFrame = performance.now();
    /** The line's scroll position as the loop keeps it: fractional, unlike scrollLeft. */
    let smoothLeft: number | undefined;
    let lastBeat: number | undefined;
    /** Until when the reader's own scrolling holds the line still, ms. */
    let manualUntil = 0;
    const holdForReader = () => {
      manualUntil = performance.now() + MANUAL_SCROLL_HOLD_MS;
    };
    const reader = hostRef.current;
    for (const type of ["wheel", "pointerdown", "touchstart", "keydown"] as const) {
      reader?.addEventListener(type, holdForReader, { passive: true });
    }
    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - lastFrame, 100) / 1000;
      lastFrame = now;
      const host = hostRef.current;
      const live = liveBeatRef.current;
      const beatNow = live?.();
      // Following leaves the line to the reader while the song stands still or they scroll it.
      const moving = beatNow !== undefined && beatNow !== lastBeat;
      lastBeat = beatNow;
      if (now < manualUntil || !moving) {
        smoothLeft = undefined;
      } else if (host && latest.current.singleLine && latest.current.follow) {
        const x = spotAt(beatXRef.current, beatNow)?.x;
        const svg = host.querySelector("svg");
        if (x !== undefined && svg) {
          const svgLeft =
            svg.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft;
          const wanted = svgLeft + x - host.clientWidth / 2;
          // Notes sit unevenly on the page and the song can stop and start: the line eases
          // towards where the song is rather than copying every change of pace.
          const ease = 1 - Math.exp(-dt / LIVE_SMOOTHING_S);
          // Coming back from the reader's scroll, the line eases from where they left it.
          const from = smoothLeft ?? host.scrollLeft;
          smoothLeft =
            Math.abs(wanted - from) > host.clientWidth * 3 ? wanted : from + (wanted - from) * ease;
          host.scrollLeft = smoothLeft;
        }
      } else {
        smoothLeft = undefined;
      }
      const target = targetRef.current;
      if (host && target) {
        const dx = target.left - host.scrollLeft;
        const dy = target.top - host.scrollTop;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          host.scrollLeft = target.left;
          host.scrollTop = target.top;
          // Reached: stop steering, so the reader can scroll by hand.
          targetRef.current = null;
        } else {
          host.scrollLeft += Math.abs(dx * GLIDE) < 1 ? Math.sign(dx) : dx * GLIDE;
          host.scrollTop += Math.abs(dy * GLIDE) < 1 ? Math.sign(dy) : dy * GLIDE;
        }
      }
      placeCursorLine(
        hostRef.current,
        cursorLineRef.current,
        beatXRef.current,
        linesRef.current,
        beatNow ?? latest.current.beat
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      for (const type of ["wheel", "pointerdown", "touchstart", "keydown"] as const) {
        reader?.removeEventListener(type, holdForReader);
      }
      cancelAnimationFrame(frame);
    };
  }, []);

  /**
   * The beat of the drawn note nearest to a click, measured on screen. OSMD's
   * own hit test works in coordinates it caches at render time, which a
   * scrolled or shifted view no longer matches.
   */
  const dragRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    dragged: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const seekAt = (clientX: number, clientY: number) => {
    if (!onSeek) return;
    let best: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [element, beat] of noteIndexRef.current.beats) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      // Rows count heavily: a note on the clicked line beats a closer one on the next line.
      const dx = clientX - (box.left + box.width / 2);
      const dy = Math.max(0, Math.abs(clientY - (box.top + box.height / 2)) - box.height / 2);
      const distance = dx * dx + 16 * dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = beat;
      }
    }
    if (best !== undefined) onSeek(best);
  };

  return (
    <div
      className={singleLine ? "staff staff--single" : "staff staff--wrapped"}
      ref={hostRef}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const host = hostRef.current;
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          left: host?.scrollLeft ?? 0,
          top: host?.scrollTop ?? 0,
          dragged: false
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        const host = hostRef.current;
        if (!drag || !host || (event.buttons & 1) === 0) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        // Grabbing the score and pulling it scrolls it, like a page under the hand.
        drag.dragged = true;
        host.scrollLeft = drag.left - dx;
        host.scrollTop = drag.top - dy;
      }}
      onPointerUp={() => {
        // A drag is not a click: letting go after pulling the score must not start the song.
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.dragged) suppressClickRef.current = true;
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        seekAt(event.clientX, event.clientY);
      }}
    >
      <div className="staff-page" ref={pageRef} />
      <div className="staff-cursor" ref={cursorLineRef} />
    </div>
  );
}
