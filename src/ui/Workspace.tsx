import { useI18n } from "../app/useI18n";
import type { ReactNode, RefObject } from "react";

import type { StaffPrefs } from "../app/useStaffPrefs";
import type { SplitDirection, TakeStaff } from "../app/useTakeReview";
import { DEFAULT_STAFF_SHARE } from "../app/screenLayout";
import type { ScreenLayout } from "../app/screenLayout";
import { Staff } from "../staff/Staff";
import { KeysHandles, LaneTopHandle, StaffHandle, TickerSlot } from "./LayoutHandles";

interface Props {
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
  readonly gameBoard?: ReactNode;
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
  const { t } = useI18n();
  const { prefs, transcription, takeStaff } = props;
  // The lane shows notes and keys, only the keys (a strip), or nothing at all.
  const laneMode = prefs.lane ? "full" : prefs.keys ? "keys" : "hidden";
  // With the lane hidden or cut to its keys, the staff may take more of the screen.
  const staffRoom = laneMode === "hidden" ? 1.9 : laneMode === "keys" ? 1.4 : 1;
  const overlay = prefs.keyStyle === "perspective" && prefs.road && prefs.lane && !props.comparing;
  const share = props.layout.staffShare ?? DEFAULT_STAFF_SHARE;
  // Two staves in a column share what one would take.
  const staffShare =
    (transcription && takeStaff === "column" ? (share * 0.26) / DEFAULT_STAFF_SHARE : share) *
    staffRoom;
  const staffShown = Boolean(props.staffXml) && prefs.visible;
  // Without the staff the lane's own top edge drags, leaving room over it.
  const laneTop = !staffShown && laneMode !== "hidden" && !props.comparing;
  const handles = props.editing && !props.comparing;
  return (
    <div className="workspace">
      <div className={`workspace-main${overlay ? " workspace-main--overlay" : ""}`}>
        {/* The word mode's text over the usual staff and lane, whose keys turn computer keys. */}
        {props.wordBoard}
        {laneMode !== "full" && props.wordTicker}
        {staffShown && props.staffXml && (
          <div className={`staves staves--${transcription ? takeStaff : "single"}`}>
            <div className="staff-slot">
              {transcription && <span className="staff-label">{t("Оригинал")}</span>}
              <Staff
                musicXml={props.staffXml}
                beat={props.beat}
                zoom={prefs.zoom}
                noteColor={prefs.noteColor}
                scoreColor={prefs.scoreColor}
                singleLine={prefs.singleLine}
                follow={prefs.follow}
                fingers={prefs.fingers}
                fingerColors={prefs.fingerColors}
                breaksFromScore={props.fixedLines}
                onSeek={props.onSeek}
                liveBeat={props.liveBeat}
                marks={props.reviewMarks}
                maxShare={staffShare}
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
                  scoreColor={prefs.scoreColor}
                  singleLine={prefs.singleLine}
                  follow={prefs.follow}
                  fingers={prefs.fingers}
                  fingerColors={prefs.fingerColors}
                  breaksFromScore={props.fixedLines}
                  onSeek={props.onSeek}
                  liveBeat={props.liveBeat}
                  marks={transcription.marks}
                  maxShare={staffShare}
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
              <span className="lane-label">{t("Оригинал")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
