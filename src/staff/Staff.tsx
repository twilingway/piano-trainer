import { worldScoreSnapshot } from "./publishWorldScore";
import type { StaffWorldSource } from "./staffWorldSnapshot";
import neonCursorUrl from "../fx/neon-cursor.webp?url";
import {
  lineBoxes,
  scrollTarget,
  centreShortScore,
  fitHeight,
  prepareStaffCursorPadding,
  type LineBox,
  type ScrollTarget
} from "./staffViewport";
import { entryBeatAt, placeCursorLine } from "./liveCursor";
import { centreLivePosition, createStaffFollow } from "./staffFollow";
import { beatPositions, indexNotes, nearestNoteBeat, type NoteIndex } from "./staffNoteIndex";
import { fitWrappedStaffSvg, StaffZoomBaseline } from "./fitCompactStaff";
import { timelineSpots } from "./staffTimelineSpots";
import { installUniformStaffLayout } from "./uniformStaffLayout";
import { installLocalNoteNames } from "./localNoteNames";
import { setStaffTempoLayout } from "./staffTempoLayout";
import { usePublishReaderGeometry, useReaderFrameBeat } from "./readerGeometry";
import { readStaffGeometry } from "./staffReaderGeometry";
import { sharedTabLabelWidths, sharedTabScale, type SharedTabLabels } from "./sharedReaderSpacing";
import { DEFAULT_PLAYED_NOTE_COLOR } from "./notationColors";
import {
  highlightUnderCursor,
  paintMarks,
  paintStaffFingerings,
  paintStaffNotes,
  setStaffColors
} from "./staffNoteColors";
import type { BeatSpot } from "./liveCursor";
import { watchStaffPresentation, type StaffPresentation } from "./staffPresentation";
import { courseCursor, courseStaffXml } from "./courseStaff";
import {
  fitCourseZoom,
  measureCourseReach,
  noteCourseReach,
  reservedSpan,
  showDrawing,
  fitCourseDrawing,
  fitCourseInk
} from "./courseStaffView";
import { OpenSheetMusicDisplay, unitInPixels, type IOSMDOptions } from "opensheetmusicdisplay";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";

export { markKey } from "./staffNoteIndex";

interface StaffProps {
  readonly worldScoreSource?: StaffWorldSource | undefined;
  readonly timeline?:
    | {
        readonly timeAtBeat: (beat: number) => number;
        readonly beats: readonly number[];
      }
    | undefined;
  readonly presentation?: StaffPresentation | undefined;
  readonly musicXml: string;
  /** Quarter notes from the start of the score; the cursor stands on the last entry at or before it. */
  readonly beat: number;
  /** 1 = the viewport-fitted baseline size. */
  readonly zoom: number;
  readonly noteColor: string;
  readonly playedNoteColor?: string;
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
  readonly liveBeat?: (() => number) | undefined;
  /** Share of the window this staff may take; two staves stacked take less each. */
  readonly maxShare?: number;
  /** Publish this original score's layout for a second reader in the same workspace. */
  readonly shareGeometry?: boolean;
  /** Labels in a second reader may require wider shared engraving. */
  readonly sharedTabs?: SharedTabLabels | undefined;
  /** A reading course: no highlight, a fitted zoom and a cursor that leaves the note readable. */
  readonly course?: boolean;
  /** A course's prompts with its extreme notes: every prompt keeps their room, nothing jumps. */
  readonly courseRange?: readonly string[] | undefined;
}

const BEAT_EPSILON = 1e-6;
/** Share of the remaining distance the view covers each frame: a glide, not a jump. */
const GLIDE = 0.12;
/** Share of the window the score may take; the lines that fit decide the exact height. */
const DEFAULT_MAX_SHARE = 0.45;
/** Movement that turns a press on the score from a click into a drag, px. */
const DRAG_THRESHOLD_PX = 5;

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

/**
 * The score under a cursor that follows the song by beats rather than by
 * seconds, so tempo changes cannot drift it off; the notes under it are
 * coloured. Zoom, line wrapping and following are the reader's choice.
 */
export function Staff({
  timeline,
  worldScoreSource,
  musicXml,
  beat,
  zoom,
  noteColor,
  playedNoteColor = DEFAULT_PLAYED_NOTE_COLOR,
  scoreColor,
  singleLine,
  follow,
  fingers,
  fingerColors,
  breaksFromScore,
  onSeek,
  marks,
  maxShare = DEFAULT_MAX_SHARE,
  shareGeometry = false,
  sharedTabs,
  liveBeat,
  presentation,
  course = false,
  courseRange
}: StaffProps) {
  const hasSharedTabs = sharedTabs !== undefined;
  const publishGeometry = usePublishReaderGeometry();
  const shownXml = useMemo(
    () => (course ? courseStaffXml(musicXml) : musicXml),
    [course, musicXml]
  );
  const readFrameBeat = useReaderFrameBeat();
  const hostRef = useRef<HTMLDivElement>(null);
  /** OSMD draws here; the host around it scrolls. */
  const pageRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const uniformRef = useRef<ReturnType<typeof installUniformStaffLayout> | undefined>(undefined);
  const reachRef = useRef<Awaited<ReturnType<typeof measureCourseReach>>>(undefined);
  const presentationRef = useRef(presentation);
  useEffect(() => {
    presentationRef.current = presentation;
  });
  const tabWidthsRef = useRef<ReadonlyMap<number, number>>(new Map());
  const baselineRef = useRef(new StaffZoomBaseline());
  const paintedRef = useRef<SVGElement[]>([]);
  // Read by the loader and the zoom effect, which must land the cursor where the song is.
  const latest = useRef({ beat, zoom, follow, singleLine, maxShare, course, playedNoteColor });
  const targetRef = useRef<ScrollTarget | null>(null);
  const linesRef = useRef<LineBox[]>([]);
  const noteIndexRef = useRef<NoteIndex>({
    beats: new Map(),
    heads: new Map(),
    cursorBeats: new Map()
  });
  /** Musical entries, including rests, with their x from the SVG's left edge and their line. */
  const beatXRef = useRef<BeatSpot[]>([]);
  /** The play cursor: a thin glowing line gliding with the song, over OSMD's own. */
  const cursorLineRef = useRef<HTMLDivElement>(null);
  const liveBeatRef = useRef(liveBeat);
  const marksRef = useRef(marks);

  useEffect(() => {
    latest.current = { beat, zoom, follow, singleLine, maxShare, course, playedNoteColor };
  });

  const showBeat = useEffectEvent((osmd: OpenSheetMusicDisplay, host: HTMLElement) => {
    moveCursor(osmd, liveBeatRef.current?.() ?? latest.current.beat);
    if (!latest.current.course)
      paintedRef.current = highlightUnderCursor(
        osmd,
        paintedRef.current,
        latest.current.playedNoteColor
      );
    // A single line with a live position scrolls every frame on its own and needs no steering.
    const live = latest.current.singleLine;
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
    prepareStaffCursorPadding(host, latest.current.singleLine && !latest.current.course);
    setStaffColors(osmd, noteColor, scoreColor);
    tabWidthsRef.current = new Map();
    const reach = latest.current.course ? reachRef.current : undefined;
    if (latest.current.course) fitCourseZoom(osmd, host, latest.current.maxShare, reach);
    else
      baselineRef.current.render(osmd, host, {
        zoom: latest.current.zoom,
        singleLine: latest.current.singleLine,
        breaksFromScore,
        maxShare: latest.current.maxShare
      });
    if (!latest.current.course && sharedTabs) {
      tabWidthsRef.current = sharedTabLabelWidths(sharedTabs, sharedTabScale(host));
      osmd.render();
    }
    if (!latest.current.course && !latest.current.singleLine) fitWrappedStaffSvg(osmd);
    if (latest.current.course) fitCourseInk(osmd, host, reservedSpan(osmd, reach));
    if (latest.current.course) noteCourseReach(courseRange, osmd, host);
    paintStaffNotes(osmd, noteColor);
    paintStaffFingerings(osmd, fingerColors, scoreColor);
    const shift = latest.current.course ? fitCourseDrawing(host, reservedSpan(osmd, reach)) : 0;
    const page = pageRef.current;
    if (page) {
      if (latest.current.singleLine || latest.current.course) page.style.transform = "";
      else centreShortScore(osmd, page);
    }
    linesRef.current = lineBoxes(osmd, shift);
    noteIndexRef.current = indexNotes(osmd);
    beatXRef.current = beatPositions(noteIndexRef.current.cursorBeats, host, linesRef.current);
    const axis = latest.current.singleLine ? uniformRef.current?.getAxis() : undefined;
    const measures = osmd.Sheet.SourceMeasures;
    const firstMeasure = measures[0];
    const lastMeasure = measures.at(-1);
    if (axis && timeline && firstMeasure && lastMeasure) {
      beatXRef.current = timelineSpots(
        axis,
        beatXRef.current,
        [...timeline.beats, ...measures.map((measure) => measure.AbsoluteTimestamp.RealValue * 4)],
        firstMeasure.AbsoluteTimestamp.RealValue * 4,
        (lastMeasure.AbsoluteTimestamp.RealValue + lastMeasure.Duration.RealValue) * 4,
        linesRef.current[0]?.top ?? 0
      );
    }
    paintMarks(noteIndexRef.current.heads, marksRef.current);
    fitHeight(host, linesRef.current, latest.current.singleLine, latest.current.maxShare);
    worldScoreSource?.publish(worldScoreSnapshot(host, beatXRef.current, linesRef.current));
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
    if (latest.current.follow) {
      if (latest.current.singleLine) {
        centreLivePosition(host, beatXRef.current, liveBeatRef.current?.() ?? latest.current.beat);
      } else host.scrollLeft = target.left;
      host.scrollTop = target.top;
    }
    if (latest.current.course) showDrawing(host, reservedSpan(osmd, reach));
    targetRef.current = null;
    if (shareGeometry) {
      publishGeometry(readStaffGeometry(osmd, host, beatXRef.current, linesRef.current));
    }
  });

  useEffect(() => {
    const host = hostRef.current;
    const page = pageRef.current;
    if (!host || !page) return;
    if (shareGeometry) publishGeometry(null);
    let cancelled = false;
    let resizeTimer = 0;
    const options: IOSMDOptions = {
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
    };
    const osmd = new OpenSheetMusicDisplay(page, options);
    const presentationId = presentationRef.current?.id;
    void Promise.all([osmd.load(shownXml), measureCourseReach(courseRange, options, host)])
      .then(([, reach]) => {
        if (cancelled) return;
        reachRef.current = reach;
        installLocalNoteNames(osmd);
        uniformRef.current =
          !course && timeline && (singleLine || hasSharedTabs)
            ? installUniformStaffLayout(osmd, timeline.timeAtBeat, {
                horizontal: singleLine,
                labelWidthAtBeat: (beat) => tabWidthsRef.current.get(beat) ?? 0
              })
            : undefined;
        setStaffTempoLayout(osmd, shownXml);
        osmd.Zoom = latest.current.zoom;
        // Half the usual page margin: the view starts at the first line anyway.
        osmd.EngravingRules.PageTopMargin = 2;
        // A fixed count per line gets equal measures, so barlines line up from line to line.
        osmd.EngravingRules.FixedMeasureWidth = breaksFromScore;
        osmd.render();
        osmd.cursor.show();
        osmdRef.current = osmd;
        relayout(osmd, host);
      })
      .catch(() => {
        if (
          !cancelled &&
          presentationId === presentationRef.current?.id &&
          presentationId !== undefined
        )
          presentationRef.current?.onError(presentationId);
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
      uniformRef.current?.dispose();
      uniformRef.current = undefined;
      osmdRef.current = null;
      osmd.clear();
      // clear() empties the score but leaves its sized SVG behind, stacked over the next one.
      page.replaceChildren();
      worldScoreSource?.publish(undefined);
      if (shareGeometry) publishGeometry(null);
    };
  }, [
    shownXml,
    worldScoreSource,
    singleLine,
    breaksFromScore,
    fingers,
    shareGeometry,
    publishGeometry,
    course,
    timeline,
    hasSharedTabs,
    courseRange
  ]);

  const presentationId = presentation?.id;
  useEffect(() => {
    if (presentationId === undefined) return;
    return watchStaffPresentation(
      () => osmdRef.current !== null && Boolean(hostRef.current?.querySelector("svg")),
      (atMs) => {
        const current = presentationRef.current;
        if (current?.id === presentationId) current.onPresented(presentationId, atMs);
      }
    );
  }, [presentationId, musicXml]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    relayout(osmd, host);
  }, [zoom, noteColor, scoreColor, fingerColors, sharedTabs]);

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
    const host = hostRef.current;
    if (host)
      worldScoreSource?.publish(worldScoreSnapshot(host, beatXRef.current, linesRef.current));
  }, [marks, worldScoreSource]);

  // Read the shared beat every frame; single-line cursors stay exactly at the viewport midpoint.
  useEffect(() => {
    let frame = 0;
    let paintedBeat: number | undefined;
    let paintedMap: readonly BeatSpot[] | undefined;
    let paintedColor: string | undefined;
    const reader = hostRef.current;
    const controller = reader ? createStaffFollow(reader) : undefined;
    const step = (timestamp: number) => {
      const host = hostRef.current;
      const beatNow = readFrameBeat(
        timestamp,
        () => liveBeatRef.current?.() ?? latest.current.beat
      );
      const osmd = osmdRef.current;
      const entryBeat = entryBeatAt(beatXRef.current, beatNow);
      if (
        osmd &&
        (entryBeat !== paintedBeat ||
          paintedMap !== beatXRef.current ||
          paintedColor !== latest.current.playedNoteColor)
      ) {
        moveCursor(osmd, beatNow);
        if (!latest.current.course)
          paintedRef.current = highlightUnderCursor(
            osmd,
            paintedRef.current,
            latest.current.playedNoteColor
          );
        paintedBeat = entryBeat;
        paintedMap = beatXRef.current;
        paintedColor = latest.current.playedNoteColor;
      }
      const following = controller?.frame(
        beatNow,
        latest.current.singleLine,
        latest.current.follow,
        beatXRef.current
      );
      if (!following) targetRef.current = null;
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
        beatNow,
        latest.current.course && osmd
          ? courseCursor(beatXRef.current.length, unitInPixels * osmd.Zoom)
          : { centered: following === true && latest.current.singleLine }
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      controller?.dispose();
      cancelAnimationFrame(frame);
    };
  }, [readFrameBeat]);

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
    const beat = nearestNoteBeat(noteIndexRef.current.beats, clientX, clientY);
    if (beat !== undefined) onSeek(beat);
  };

  return (
    <div
      className={`${singleLine ? "staff staff--single" : "staff staff--wrapped"}${course ? " staff--course" : ""}`}
      ref={hostRef}
      style={{
        overflowY: !course && zoom > 1 ? "auto" : undefined,
        overflowX: !course && !singleLine ? "auto" : undefined
      }}
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
      <div
        className="staff-cursor"
        ref={cursorLineRef}
        style={{ backgroundImage: `url("${neonCursorUrl}")` }}
      />
    </div>
  );
}
