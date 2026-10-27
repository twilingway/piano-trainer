import type { StaffWorldSource } from "../staff/staffWorldSnapshot";
import neonRailUrl from "../fx/neon-rail.webp?url";
import { useI18n } from "../app/useI18n";
import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";
import { secondsAt, type Song } from "../song/song";

import type { StaffPrefs } from "../app/useStaffPrefs";
import type { SplitDirection, TakeStaff } from "../app/useTakeReview";
import { DEFAULT_STAFF_SHARE } from "../app/screenLayout";
import type { ScreenLayout } from "../app/screenLayout";
import { Staff } from "../staff/Staff";
import type { StaffPresentation } from "../staff/staffPresentation";
import { ReaderGeometryProvider } from "../staff/readerGeometry";
import { KeysHandles, LaneTopHandle, StaffHandle, TickerSlot } from "./LayoutHandles";

interface Props {
  readonly worldScore?: {
    readonly source: StaffWorldSource;
    readonly hidden: boolean;
    readonly error: boolean;
  };
  readonly timelineSong?: Song | undefined;
  readonly staffPresentation?: StaffPresentation | undefined;
  readonly staffRetry?: number;
  readonly readingBeat?: number | undefined;
  /** A reading course is on: its staff is fitted and its cursor leaves the note readable. */
  readonly course?: boolean;
  /** The score on the staff; a MIDI song has none. */
  readonly staffXml: string | undefined;
  readonly prefs: StaffPrefs;
  /** Lines break where the score says, not by the width. */
  readonly fixedLines: boolean;
  readonly beat: number;
  readonly liveBeat: () => number;
  readonly onSeek: (beat: number) => void;
  readonly reviewMarks: ReadonlyMap<string, string> | undefined;
  /** The take written out as a score, when it is shown. */
  readonly transcription:
    { readonly musicXml: string; readonly marks: ReadonlyMap<string, string> } | undefined;
  readonly takeStaff: TakeStaff;
  readonly splitDirection: SplitDirection;
  readonly comparing: boolean;
  readonly waiting: boolean;
  /** Where the trainer's Pixi view mounts. */
  readonly hostRef: RefObject<HTMLDivElement | null>;
  /** Where the original mounts while a take is compared with it. */
  readonly mirrorHostRef: RefObject<HTMLDivElement | null>;
  readonly countdown?: number | null;
  readonly handStatus?: "idle" | "loading" | "ready" | "error";
  readonly gameBoard?: ReactNode;
  /** Course tabs share the score area without remounting the falling-note view. */
  readonly scoreBoard?: ReactNode;
  readonly lessonBoard?: ((score: ReactNode) => ReactNode) | undefined;
  /** The first enabled reader stays above the second while both are shown. */
  readonly scoreFirst?: "tabs" | "staff";
  readonly wordBoard?: ReactNode;
  /** The word mode's running line: over the keys when the lane shows its notes. */
  readonly wordTicker?: ReactNode;
  /** Where the player dragged the staff's edge, the keys and the running line. */
  readonly layout: ScreenLayout;
  readonly onLayout: (change: Partial<ScreenLayout>) => void;
  /** The edit mode: only in it the handles, the text size and the reset show and drag. */
  readonly editing: boolean;
  /** A one-line staff's edge changes its zoom. */
  readonly onZoom: (zoom: number) => void;
  /** Something is off its reset place: the lane offers the reset. */
  readonly layoutMoved: boolean;
  /** Puts the dragged parts back where they were. */
  readonly onResetLayout: () => void;
}

/** The game: the staff (and the take's own) over the falling notes (and the original's). */
export function Workspace({ hostRef, mirrorHostRef, ...props }: Props) {
  const { t, formatNumber } = useI18n();
  const { prefs, transcription, takeStaff } = props;
  // Stable for the score's lifetime: the engraving adapter reads this mapping at relayout.
  const timeline = useMemo(() => {
    const song = props.timelineSong;
    return song
      ? {
          timeAtBeat: (beat: number) => secondsAt(song, beat),
          beats: song.beats.map((beat) => beat.position)
        }
      : undefined;
  }, [props.timelineSong]);
  // The lane shows notes and keys, only the keys (a strip), or nothing at all.
  const laneMode = prefs.lane ? "full" : prefs.keys ? "keys" : "hidden";
  // With the lane hidden or cut to its keys, the staff may take more of the screen.
  const staffRoom = laneMode === "hidden" ? 1.9 : laneMode === "keys" ? 1.4 : 1;
  const staffShown = Boolean(props.staffXml) && prefs.visible;
  const dualScore = Boolean(props.scoreBoard) && staffShown;
  const sharedTabs = useMemo(
    () =>
      dualScore && props.timelineSong
        ? {
            notes: props.timelineSong.notes,
            noteNames: prefs.noteNames,
            zoom: prefs.tabsZoom
          }
        : undefined,
    [dualScore, props.timelineSong, prefs.noteNames, prefs.tabsZoom]
  );
  const share = props.layout.staffShare ?? DEFAULT_STAFF_SHARE;
  // Two staves in a column share what one would take.
  const staffShare =
    (transcription && takeStaff === "column" ? (share * 0.26) / DEFAULT_STAFF_SHARE : share) *
    staffRoom;
  // Without the staff the lane's own top edge drags, leaving room over it.
  const laneTop = !staffShown && !props.scoreBoard && laneMode !== "hidden" && !props.comparing;
  const handles = props.editing && !props.comparing;
  const showEdges = prefs.lane && !prefs.freeCamera && !prefs.performanceScene;
  const showHitEdge = prefs.keyStyle !== "3d" || !prefs.keys || Boolean(props.wordBoard);
  const staffBoard = staffShown && props.staffXml && (
    <div
      key="staff"
      className={`staves staves--${transcription ? takeStaff : "single"}`}
      style={
        props.worldScore?.hidden
          ? { visibility: "hidden", position: "absolute", width: "100%", pointerEvents: "none" }
          : undefined
      }
    >
      <div className="staff-slot">
        {transcription && <span className="staff-label">{t("Оригинал")}</span>}
        <Staff
          key={props.staffRetry ?? 0}
          presentation={props.staffPresentation}
          musicXml={props.staffXml}
          beat={props.readingBeat ?? props.beat}
          zoom={prefs.zoom}
          noteColor={prefs.noteColor}
          playedNoteColor={prefs.playedNoteColor}
          scoreColor={prefs.scoreColor}
          singleLine={prefs.singleLine}
          follow={prefs.follow}
          fingers={prefs.fingers}
          fingerColors={prefs.fingerColors}
          breaksFromScore={props.fixedLines}
          onSeek={props.onSeek}
          liveBeat={props.staffPresentation ? undefined : props.liveBeat}
          marks={props.reviewMarks}
          maxShare={dualScore ? Math.min(staffShare, 0.2) : staffShare}
          shareGeometry={dualScore}
          sharedTabs={sharedTabs}
          course={props.course ?? false}
          timeline={timeline}
          worldScoreSource={props.worldScore?.source}
        />
      </div>
      {transcription && (
        <div className="staff-slot">
          <span className="staff-label">{t("Ваш дубль")}</span>
          <Staff
            musicXml={transcription.musicXml}
            beat={props.beat}
            zoom={prefs.zoom}
            noteColor={prefs.noteColor}
            playedNoteColor={prefs.playedNoteColor}
            scoreColor={prefs.scoreColor}
            singleLine={prefs.singleLine}
            follow={prefs.follow}
            fingers={prefs.fingers}
            fingerColors={prefs.fingerColors}
            breaksFromScore={props.fixedLines}
            onSeek={props.onSeek}
            liveBeat={props.liveBeat}
            marks={transcription.marks}
            maxShare={dualScore ? Math.min(staffShare, 0.2) : staffShare}
            timeline={timeline}
          />
        </div>
      )}
      {props.editing && (
        <StaffHandle
          singleLine={prefs.singleLine}
          zoom={prefs.zoom}
          room={staffRoom}
          onLayout={props.onLayout}
          onZoom={props.onZoom}
        />
      )}
    </div>
  );
  const tabsBoard = (
    <div key="tabs" className="course-score-slot">
      {props.scoreBoard}
    </div>
  );
  return (
    <div className="workspace">
      <div className={props.course ? "workspace-main workspace-main--practice" : "workspace-main"}>
        {props.countdown != null && (
          <div className="play-countdown" role="status" aria-live="polite" aria-atomic="true">
            <span>{props.countdown > 0 ? t("Приготовьтесь") : t("Готовим звук…")}</span>
            {props.countdown > 0 && <strong>{formatNumber(props.countdown)}</strong>}
          </div>
        )}
        {props.worldScore?.error && (
          <span role="status">
            {t("Не удалось показать нотный стан в 3D. Оставили обычный вид.")}
          </span>
        )}
        {/* The word mode's text over the usual staff and lane, whose keys turn computer keys. */}
        {props.wordBoard}
        {laneMode !== "full" && props.wordTicker}
        {props.scoreBoard && !dualScore && (
          <div className="course-score-slot">{props.scoreBoard}</div>
        )}
        {dualScore ? (
          <div className="course-score-stack">
            <ReaderGeometryProvider key={props.staffXml}>
              {props.scoreFirst === "staff" ? [staffBoard, tabsBoard] : [tabsBoard, staffBoard]}
            </ReaderGeometryProvider>
          </div>
        ) : props.lessonBoard ? (
          props.lessonBoard(staffBoard)
        ) : (
          staffBoard
        )}

        {/* Over a full lane the score hangs at its top; over keys alone it takes a row. */}
        {!props.comparing && laneMode !== "full" && (
          <div className="game-score-dock">{props.gameBoard}</div>
        )}

        {laneTop && (
          <div
            className="lane-top-gap"
            style={{ flexBasis: `${String(props.layout.laneTop * 100)}%` }}
          />
        )}

        {/* Hidden, not removed: the view under it keeps the keys, the sound and the take going. */}
        <div
          className={`lanes lanes--${props.splitDirection} lanes--${laneMode}`}
          // A held key is a played note, not a picture to save or copy.
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          {laneTop && props.editing && (
            <LaneTopHandle top={props.layout.laneTop} onLayout={props.onLayout} />
          )}
          <div className="lane" ref={hostRef}>
            {showEdges && <LaneEdges hitVisible={showHitEdge} />}
            {prefs.keyStyle === "3d" &&
              prefs.hands &&
              prefs.keys &&
              !props.comparing &&
              (props.handStatus === "loading" || props.handStatus === "error") && (
                <span className="hands-status" role="status">
                  {props.handStatus === "loading"
                    ? t("Загружаем 3D-руки…")
                    : t("3D-руки не загрузились. Можно продолжать играть.")}
                </span>
              )}
            {props.comparing && <span className="lane-label">{t("Ваш дубль")}</span>}
            {props.waiting && <span className="waiting-pill">{t("Жду ноту")}</span>}
            {!props.comparing && laneMode === "full" && props.gameBoard}
            {prefs.keys && laneMode !== "hidden" && handles && (
              <KeysHandles layout={props.layout} onLayout={props.onLayout} />
            )}
            {props.layoutMoved && handles && (
              <button type="button" className="layout-reset" onClick={props.onResetLayout}>
                {t("↺ Сбросить расположение")}
              </button>
            )}
            {laneMode === "full" && props.wordTicker && (
              <TickerSlot
                editing={props.editing}
                gap={props.layout.tickerGap}
                x={props.layout.tickerX}
                scale={props.layout.tickerScale}
                onLayout={props.onLayout}
              >
                {props.wordTicker}
              </TickerSlot>
            )}
          </div>
          {props.comparing && (
            <div className="lane" ref={mirrorHostRef}>
              {showEdges && <LaneEdges hitVisible={showHitEdge} />}
              <span className="lane-label">{t("Оригинал")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LaneEdges({ hitVisible }: { readonly hitVisible: boolean }) {
  const style = { backgroundImage: `url("${neonRailUrl}")` };
  return (
    <>
      <div className="lane-neon-edge lane-neon-edge--top" aria-hidden="true" style={style} />
      {hitVisible && (
        <div className="lane-neon-edge lane-neon-edge--hit" aria-hidden="true" style={style} />
      )}
    </>
  );
}
