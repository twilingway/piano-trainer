import { OpenSheetMusicDisplay, VexFlowGraphicalNote, unitInPixels } from "opensheetmusicdisplay";
import { useEffect, useEffectEvent, useRef } from "react";

interface StaffProps {
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
  /** 1 = OSMD's own size. */
  readonly zoom: number;
  /** One endless line that scrolls sideways, or systems wrapped to the width like a printed page. */
  readonly singleLine: boolean;
  /** Keep the cursor in view as the song plays. */
  readonly follow: boolean;
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
const HIGHLIGHT = "#e63946";
/** Share of the remaining distance the view covers each frame: a glide, not a jump. */
const GLIDE = 0.12;
/** Share of the window the score may take; the lines that fit decide the exact height. */
const DEFAULT_MAX_SHARE = 0.45;
/** Time constant of the single line's easing, seconds: long enough to hide a note's jolt. */
const LIVE_SMOOTHING_S = 0.35;
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

/** Colours the noteheads under the cursor; returns them so the next move can restore them. */
/** A notehead and the paths it is drawn with: everything a colour has to reach. */
function noteheadShapes(note: VexFlowGraphicalNote): SVGElement[] {
  const shapes: SVGElement[] = [];
  // OSMD types the heads as HTMLElement; in an SVG backend they are SVG groups.
  for (const head of note.getNoteheadSVGs()) {
    for (const shape of [head, ...Array.from(head.querySelectorAll("path"))]) {
      if (shape instanceof SVGElement) shapes.push(shape);
    }
  }
  return shapes;
}

/** Back to the review colour if the take marked it, to black if not. */
function restoreFill(shape: SVGElement): void {
  const mark = shape.dataset.mark;
  if (mark) shape.style.fill = mark;
  else shape.style.removeProperty("fill");
}

function highlightUnderCursor(
  osmd: OpenSheetMusicDisplay,
  previous: readonly SVGElement[]
): SVGElement[] {
  for (const element of previous) restoreFill(element);
  const painted: SVGElement[] = [];
  for (const note of osmd.cursor.GNotesUnderCursor()) {
    if (!(note instanceof VexFlowGraphicalNote)) continue;
    for (const shape of noteheadShapes(note)) {
      shape.style.fill = HIGHLIGHT;
      painted.push(shape);
    }
  }
  return painted;
}

/** Colours noteheads by the review of the last take; notes it does not name go back to black. */
function paintMarks(
  heads: ReadonlyMap<string, readonly SVGElement[]>,
  marks: ReadonlyMap<string, string> | undefined
): void {
  for (const [key, shapes] of heads) {
    const mark = marks?.get(key);
    for (const shape of shapes) {
      if (mark) shape.dataset.mark = mark;
      else delete shape.dataset.mark;
      restoreFill(shape);
    }
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

/** Every beat that has a note, with that note's x centre from the left edge of the SVG. */
function beatPositions(
  beats: ReadonlyMap<SVGGElement, number>,
  host: HTMLElement
): (readonly [number, number])[] {
  const svg = host.querySelector("svg");
  if (!svg) return [];
  const left = svg.getBoundingClientRect().left;
  const byBeat = new Map<number, number>();
  for (const [element, beat] of beats) {
    const box = element.getBoundingClientRect();
    if (box.width === 0) continue;
    const x = box.left + box.width / 2 - left;
    byBeat.set(beat, Math.min(byBeat.get(beat) ?? x, x));
  }
  return [...byBeat].sort((a, b) => a[0] - b[0]);
}

/** The x a beat falls at, between the notes around it; past the ends, at the nearest note. */
function xAtBeat(
  positions: readonly (readonly [number, number])[],
  beat: number
): number | undefined {
  const first = positions[0];
  if (!first) return undefined;
  if (beat <= first[0]) return first[1];
  for (let index = 1; index < positions.length; index++) {
    const after = positions[index];
    const before = positions[index - 1];
    if (!after || !before) break;
    if (beat <= after[0]) {
      const share = (beat - before[0]) / (after[0] - before[0]);
      return before[1] + share * (after[1] - before[1]);
    }
  }
  return positions.at(-1)?.[1];
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
  singleLine,
  follow,
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
  /** Each beat that has a note, with the x of that note from the SVG's left edge, in order. */
  const beatXRef = useRef<(readonly [number, number])[]>([]);
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
    osmd.render();
    const page = pageRef.current;
    if (page) {
      if (latest.current.singleLine) page.style.transform = "";
      else centreShortScore(osmd, page);
    }
    linesRef.current = lineBoxes(osmd);
    noteIndexRef.current = indexNotes(osmd);
    beatXRef.current = beatPositions(noteIndexRef.current.beats, host);
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
      // Re-flowing on resize is done below, so the line sizes are measured again too.
      autoResize: false,
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      // Off by default for a one-part score; the fingers are the point here.
      drawFingerings: true,
      renderSingleHorizontalStaffline: singleLine,
      followCursor: false,
      newSystemFromXML: breaksFromScore,
      // Eighths and shorter are beamed beat by beat, so each beat reads as one group at a glance.
      autoBeam: true,
      autoBeamOptions: { groups: [[1, 4]] }
    });
    void osmd.load(musicXml).then(() => {
      if (cancelled) return;
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
    // A wrapped page re-flows to a new width; a single line never needs to.
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (osmdRef.current === osmd && !latest.current.singleLine) relayout(osmd, host);
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      osmdRef.current = null;
      osmd.clear();
      // clear() empties the score but leaves its sized SVG behind, stacked over the next one.
      page.replaceChildren();
    };
  }, [musicXml, singleLine, breaksFromScore]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host || osmd.Zoom === zoom) return;
    osmd.Zoom = zoom;
    relayout(osmd, host);
  }, [zoom]);

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
    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - lastFrame, 100) / 1000;
      lastFrame = now;
      const host = hostRef.current;
      const live = liveBeatRef.current;
      if (host && live && latest.current.singleLine && latest.current.follow) {
        const x = xAtBeat(beatXRef.current, live());
        const svg = host.querySelector("svg");
        if (x !== undefined && svg) {
          const svgLeft =
            svg.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft;
          const wanted = svgLeft + x - host.clientWidth / 2;
          // Notes sit unevenly on the page and the song can stop and start: the line eases
          // towards where the song is rather than copying every change of pace.
          const ease = 1 - Math.exp(-dt / LIVE_SMOOTHING_S);
          smoothLeft =
            smoothLeft === undefined || Math.abs(wanted - smoothLeft) > host.clientWidth
              ? wanted
              : smoothLeft + (wanted - smoothLeft) * ease;
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
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  /**
   * The beat of the drawn note nearest to a click, measured on screen. OSMD's
   * own hit test works in coordinates it caches at render time, which a
   * scrolled or shifted view no longer matches.
   */
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
      onClick={(event) => {
        seekAt(event.clientX, event.clientY);
      }}
    >
      <div className="staff-page" ref={pageRef} />
    </div>
  );
}
