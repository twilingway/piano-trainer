import type { StaffProps } from "./staffProps";
import { fitStaffIllustration } from "./staffIllustration";
import { musicXmlWithClayColors } from "../song/clayNotes";
import { applyStaffClayMaterial } from "./staffClayMaterial";
import { worldScoreSnapshot } from "./publishWorldScore";
import { revealLessonEntry } from "./lessonViewport";
import { useLessonStaffFeedback } from "./useLessonStaffFeedback";
import { moveCursor } from "./staffCursorNavigation";
import { useStaffPointerNavigation } from "./useStaffPointerNavigation";
import { createStaffOsmdOptions } from "./staffOsmdOptions";
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
import { beatPositions, indexNotes, emptyNoteIndex } from "./staffNoteIndex";
import { fitWrappedStaffSvg, StaffZoomBaseline } from "./fitCompactStaff";
import { timelineSpots } from "./staffTimelineSpots";
import { installUniformStaffLayout } from "./uniformStaffLayout";
import { installLocalNoteNames } from "./localNoteNames";
import { setStaffTempoLayout } from "./staffTempoLayout";
import { usePublishReaderGeometry, useReaderFrameBeat } from "./readerGeometry";
import { readStaffGeometry } from "./staffReaderGeometry";
import { sharedTabLabelWidths, sharedTabScale } from "./sharedReaderSpacing";
import { DEFAULT_PLAYED_NOTE_COLOR } from "./notationColors";
import {
  highlightUnderCursor,
  paintMarks,
  paintStaffFingerings,
  paintStaffNotes,
  setStaffColors
} from "./staffNoteColors";
import type { BeatSpot } from "./liveCursor";
import { watchStaffPresentation } from "./staffPresentation";
import { courseCursor, courseStaffXml } from "./courseStaff";
import {
  fitCourseZoom,
  measureCourseReach,
  noteCourseReach,
  reservedSpan,
  showDrawing,
  fitCourseDrawing
} from "./courseStaffView";
import { OpenSheetMusicDisplay, unitInPixels } from "opensheetmusicdisplay";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";

export { markKey } from "./staffNoteIndex";

/** Share of the remaining distance the view covers each frame: a glide, not a jump. */
const GLIDE = 0.12;
/** Share of the window the score may take; the lines that fit decide the exact height. */
const DEFAULT_MAX_SHARE = 0.45;

/**
 * The score under a cursor that follows the song by beats rather than by
 * seconds, so tempo changes cannot drift it off; the notes under it are
 * coloured. Zoom, line wrapping and following are the reader's choice.
 */
export function Staff({
  onLoadSettled,
  lessonStaffFeedback,
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
  courseRange,
  material = course ? "clay" : "classic",
  pitchColors = false,
  pitchColorNoteId,
  illustration = false
}: StaffProps) {
  const hasSharedTabs = sharedTabs !== undefined;
  const palette = pitchColors || pitchColorNoteId !== undefined;
  const publishGeometry = usePublishReaderGeometry();
  const shownXml = useMemo(() => {
    const xml = palette
      ? musicXmlWithClayColors(musicXml, pitchColors ? undefined : pitchColorNoteId)
      : musicXml;
    return course ? courseStaffXml(xml) : xml;
  }, [course, musicXml, palette, pitchColors, pitchColorNoteId]);
  const readFrameBeat = useReaderFrameBeat();
  const hostRef = useRef<HTMLDivElement>(null);
  /** OSMD draws here; the host around it scrolls. */
  const pageRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const uniformRef = useRef<ReturnType<typeof installUniformStaffLayout> | undefined>(undefined);
  const reachRef = useRef<Awaited<ReturnType<typeof measureCourseReach>>>(undefined);
  const presentationRef = useRef(presentation);
  const cancelPresentationRef = useRef<(() => void) | undefined>(undefined);
  const loadSettled = useEffectEvent(() => onLoadSettled?.());
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
  const noteIndexRef = useRef(emptyNoteIndex());
  const revealedLessonBeat = useRef<number | undefined>(undefined);
  const feedbackRef = useLessonStaffFeedback(lessonStaffFeedback, hostRef, noteIndexRef);
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
    setStaffColors(osmd, noteColor, scoreColor, palette);
    tabWidthsRef.current = new Map();
    const reach = latest.current.course ? reachRef.current : undefined;
    if (latest.current.course)
      fitCourseZoom(osmd, host, latest.current.maxShare, reach, latest.current.zoom);
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
    if (latest.current.course) noteCourseReach(courseRange, osmd, host);
    paintStaffNotes(osmd, noteColor, palette);
    applyStaffClayMaterial(host, material === "clay");
    paintStaffFingerings(osmd, fingerColors, scoreColor);
    const shift =
      latest.current.course && !illustration
        ? fitCourseDrawing(host, reservedSpan(osmd, reach))
        : 0;
    const illustrationLines = illustration ? fitStaffIllustration(host) : undefined;
    const page = pageRef.current;
    if (page) {
      if (latest.current.singleLine || latest.current.course) page.style.transform = "";
      else centreShortScore(osmd, page);
    }
    linesRef.current = illustrationLines ?? lineBoxes(osmd, shift);
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
    if (latest.current.course && !illustration) {
      showDrawing(host, reservedSpan(osmd, reach));
      revealLessonEntry(
        host,
        noteIndexRef.current.cursorBeats,
        latest.current.beat,
        noteIndexRef.current.feedbackHeads
      );
      revealedLessonBeat.current = entryBeatAt(beatXRef.current, latest.current.beat);
    }
    targetRef.current = null;
    feedbackRef.current?.refresh();
    if (shareGeometry) {
      publishGeometry(readStaffGeometry(osmd, host, beatXRef.current, linesRef.current));
    }
  });

  useEffect(() => {
    const host = hostRef.current;
    const page = pageRef.current;
    if (!host || !page) return;
    const feedback = feedbackRef.current;
    feedback?.invalidate();
    if (shareGeometry) publishGeometry(null);
    let cancelled = false;
    let resizeTimer = 0;
    const options = createStaffOsmdOptions(host, { fingers, singleLine, breaksFromScore });
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
        if (!cancelled) {
          cancelPresentationRef.current?.();
          loadSettled();
        }
        if (!cancelled) feedback?.fail();
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
    const lessonBody = host.closest(".lesson-workspace__body");
    const resizeObserver = new ResizeObserver(onResize);
    if (workspace) resizeObserver.observe(workspace);
    if (lessonBody) resizeObserver.observe(lessonBody);
    return () => {
      cancelled = true;
      feedback?.invalidate();
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
    feedbackRef,
    worldScoreSource,
    singleLine,
    breaksFromScore,
    fingers,
    shareGeometry,
    publishGeometry,
    course,
    timeline,
    hasSharedTabs,
    courseRange,
    illustration
  ]);

  const presentationId = presentation?.id;
  useEffect(() => {
    const cancel = watchStaffPresentation(
      () => osmdRef.current !== null && Boolean(hostRef.current?.querySelector("svg")),
      (atMs) => {
        const current = presentationRef.current;
        if (presentationId !== undefined && current?.id === presentationId) {
          feedbackRef.current?.ready(presentationId);
          current.onPresented(presentationId, atMs);
        }
        loadSettled();
      }
    );
    cancelPresentationRef.current = cancel;
    return cancel;
  }, [
    presentationId,
    musicXml,
    feedbackRef,
    lessonStaffFeedback,
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
    courseRange,
    illustration
  ]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    relayout(osmd, host);
  }, [zoom, noteColor, scoreColor, fingerColors, sharedTabs, material, palette, illustration]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    if (!osmd || !host) return;
    showBeat(osmd, host);
    const entry = entryBeatAt(beatXRef.current, beat);
    if (course && entry !== revealedLessonBeat.current) {
      revealLessonEntry(
        host,
        noteIndexRef.current.cursorBeats,
        beat,
        noteIndexRef.current.feedbackHeads
      );
      revealedLessonBeat.current = entry;
    }
  }, [beat, course]);

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

  const pointerHandlers = useStaffPointerNavigation(hostRef, noteIndexRef, onSeek);

  return (
    <div
      className={`${singleLine ? "staff staff--single" : "staff staff--wrapped"}${course ? " staff--course" : ""}`}
      ref={hostRef}
      style={{
        overflowY: !course && zoom > 1 ? "auto" : undefined,
        overflowX: !course && !singleLine ? "auto" : undefined
      }}
      {...pointerHandlers}
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
