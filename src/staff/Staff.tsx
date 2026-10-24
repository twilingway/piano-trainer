import { worldScoreSnapshot } from "./publishWorldScore";
import type { StaffWorldSource } from "./staffWorldSnapshot";
import neonCursorUrl from "../fx/neon-cursor.webp?url";
import {
  lineBoxes,
  scrollTarget,
  centreShortScore,
  fitHeight,
  type LineBox,
  type ScrollTarget
} from "./staffViewport";
import { entryBeatAt, placeCursorLine } from "./liveCursor";
import { centreLivePosition, createStaffFollow } from "./staffFollow";
import { beatPositions, indexNotes, type NoteIndex } from "./staffNoteIndex";
import { fitCompactStaff, staffZoom } from "./fitCompactStaff";
import { fitWrappedStaff } from "./fitWrappedStaff";
import { timelineSpots } from "./staffTimelineSpots";
import { installUniformStaffLayout } from "./uniformStaffLayout";
import { installLocalNoteNames } from "./localNoteNames";
import { setStaffTempoLayout } from "./staffTempoLayout";
import { usePublishReaderGeometry, useReaderFrameBeat } from "./readerGeometry";
import { readStaffGeometry } from "./staffReaderGeometry";
import { sharedReaderSpacing } from "./sharedReaderSpacing";
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
import { courseCursor, courseStaffXml, courseStaffZoom } from "./courseStaff";
import { courseRoom, lineExtent, showDrawing } from "./courseStaffView";
import { OpenSheetMusicDisplay, unitInPixels } from "opensheetmusicdisplay";
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
  /** 1 = OSMD's own size. */
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
  readonly sharedNoteNames?: "off" | "ru" | "en" | undefined;
  /** A reading course: no highlight, a fitted zoom and a cursor that leaves the note readable. */
  readonly course?: boolean;
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
  sharedNoteNames,
  liveBeat,
  presentation,
  course = false
}: StaffProps) {
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
  const presentationRef = useRef(presentation);
  useEffect(() => {
    presentationRef.current = presentation;
  });
  const baseSpacingRef = useRef(1);
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
    setStaffColors(osmd, noteColor, scoreColor);
    osmd.EngravingRules.VoiceSpacingMultiplierVexflow = sharedReaderSpacing(
      baseSpacingRef.current,
      sharedNoteNames
    );
    // A course ignores the song's saved zoom and the phone's smaller staff: its short exercise is
    // the main thing on screen and is fitted to the room it has.
    osmd.Zoom = latest.current.course ? 1 : staffZoom(host, latest.current.zoom);
    osmd.render();
    if (!latest.current.course && !latest.current.singleLine && breaksFromScore)
      fitWrappedStaff(osmd);
    if (latest.current.course) {
      osmd.Zoom *= courseStaffZoom(lineExtent(osmd), courseRoom(host, latest.current.maxShare));
      osmd.render();
    }
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
    beatXRef.current = beatPositions(noteIndexRef.current.cursorBeats, host, linesRef.current);
    const axis = uniformRef.current?.getAxis();
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
    if (latest.current.course) showDrawing(host);
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
    baseSpacingRef.current = osmd.EngravingRules.VoiceSpacingMultiplierVexflow;
    const presentationId = presentationRef.current?.id;
    void osmd
      .load(shownXml)
      .then(() => {
        if (cancelled) return;
        installLocalNoteNames(osmd);
        uniformRef.current =
          singleLine && !course && timeline
            ? installUniformStaffLayout(osmd, timeline.timeAtBeat)
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
    timeline
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
  }, [zoom, noteColor, scoreColor, fingerColors, sharedNoteNames]);

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
      className={`${singleLine ? "staff staff--single" : "staff staff--wrapped"}${course ? " staff--course" : ""}`}
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
      <div
        className="staff-cursor"
        ref={cursorLineRef}
        style={{ backgroundImage: `url("${neonCursorUrl}")` }}
      />
    </div>
  );
}
